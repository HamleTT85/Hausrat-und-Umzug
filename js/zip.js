// Minimaler ZIP-Ersteller (Methode „store“, ohne Kompression — JPEGs sind
// bereits komprimiert). Keine externe Bibliothek nötig.

let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return (CRC_TABLE = t);
}
function crc32(u8) {
  const t = crcTable();
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = t[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export function sanitizeName(s, max = 48) {
  const clean = String(s || 'Gegenstand')
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, max);
  return clean || 'Gegenstand';
}

/**
 * @param {Array<{name:string, data:Uint8Array}>} entries
 * @returns {Blob} application/zip
 */
export function buildZip(entries) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const data = e.data;
    const crc = crc32(data);

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);       // version needed
    lh.setUint16(6, 0x0800, true);   // flags: UTF-8-Namen
    lh.setUint16(8, 0, true);        // method: store
    lh.setUint16(10, 0, true);       // mod time
    lh.setUint16(12, 0, true);       // mod date
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, nameBytes.length, true);
    lh.setUint16(28, 0, true);       // extra len
    chunks.push(new Uint8Array(lh.buffer), nameBytes, data);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);       // version made by
    ch.setUint16(6, 20, true);       // version needed
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, 0, true);
    ch.setUint16(14, 0, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, nameBytes.length, true);
    ch.setUint16(30, 0, true);
    ch.setUint16(32, 0, true);
    ch.setUint16(34, 0, true);
    ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true);
    ch.setUint32(42, offset, true);  // Offset des Local Headers
    central.push({ header: new Uint8Array(ch.buffer), name: nameBytes });

    offset += 30 + nameBytes.length + data.length;
  }

  const centralStart = offset;
  for (const c of central) {
    chunks.push(c.header, c.name);
    offset += c.header.length + c.name.length;
  }
  const centralSize = offset - centralStart;

  const eo = new DataView(new ArrayBuffer(22));
  eo.setUint32(0, 0x06054b50, true);
  eo.setUint16(4, 0, true);
  eo.setUint16(6, 0, true);
  eo.setUint16(8, central.length, true);
  eo.setUint16(10, central.length, true);
  eo.setUint32(12, centralSize, true);
  eo.setUint32(16, centralStart, true);
  eo.setUint16(20, 0, true);
  chunks.push(new Uint8Array(eo.buffer));

  return new Blob(chunks, { type: 'application/zip' });
}

async function blobBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Fotos mehrerer Gegenstände als ein ZIP (pro Gegenstand ein Ordner). */
export async function exportItemsPhotosZip(db, items, roomName = () => '') {
  const entries = [];
  const usedNames = {};
  let manifest = `HausRat — Foto-Export (${new Date().toLocaleDateString('de-DE')})\n\n`;

  for (const it of items) {
    let base = sanitizeName(it.name);
    usedNames[base] = (usedNames[base] || 0) + 1;
    if (usedNames[base] > 1) base = `${base}_${usedNames[base]}`;

    const price = it.sale?.price ?? it.value;
    const room = roomName(it);
    manifest += `• ${it.name || 'Ohne Namen'}`;
    if (price != null) manifest += ` — ${price} €${it.quantity > 1 ? ` je Stück (${it.quantity}×)` : ''}`;
    if (room) manifest += ` [${room}]`;
    manifest += '\n';
    const desc = (it.sale?.description || it.notes || '').replace(/\s*\n\s*/g, ' ').trim();
    if (desc) manifest += `   ${desc}\n`;

    let n = 0;
    for (const pid of it.photoIds || []) {
      const p = await db.get('photos', pid);
      if (p?.blob) {
        n++;
        entries.push({ name: `${base}/${base}_${n}.jpg`, data: await blobBytes(p.blob) });
      }
    }
    if (!n) manifest += '   (kein Foto)\n';
    manifest += '\n';
  }

  entries.push({ name: '00_liste.txt', data: new TextEncoder().encode(manifest) });
  return buildZip(entries);
}

/** Fotos eines einzelnen Gegenstands: 1 Foto → JPG, mehrere → ZIP. */
export async function exportSingleItemPhotos(db, item) {
  const base = sanitizeName(item.name);
  const photos = [];
  for (const pid of item.photoIds || []) {
    const p = await db.get('photos', pid);
    if (p?.blob) photos.push(p.blob);
  }
  if (!photos.length) return null;
  if (photos.length === 1) {
    return { blob: photos[0], filename: `${base}.jpg` };
  }
  const entries = [];
  for (let i = 0; i < photos.length; i++) {
    entries.push({ name: `${base}_${i + 1}.jpg`, data: await blobBytes(photos[i]) });
  }
  return { blob: buildZip(entries), filename: `${base}.zip` };
}
