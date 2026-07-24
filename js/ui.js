// UI-Helfer: HTML-Rendering, Toasts, Bottom-Sheets, Thumbnails.
import { db, uid } from './db.js';
import { CATEGORIES, STATUSES } from './data.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function toast(msg, ms = 2600) {
  const host = document.getElementById('toast-host');
  const node = el(`<div class="toast">${esc(msg)}</div>`);
  host.appendChild(node);
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 320);
  }, ms);
}

export function sheet(html) {
  const host = document.getElementById('sheet-host');
  host.innerHTML = '';
  const scrim = el('<div class="sheet-scrim"></div>');
  const box = el(`<div class="sheet" role="dialog"><div class="sheet-handle"></div>${html}</div>`);
  scrim.addEventListener('click', closeSheet);
  host.append(scrim, box);
  return box;
}

export function closeSheet() {
  document.getElementById('sheet-host').innerHTML = '';
}

export async function confirmSheet(title, text, confirmLabel = 'Löschen') {
  return new Promise((resolve) => {
    const box = sheet(`
      <h3>${esc(title)}</h3>
      <p class="muted">${esc(text)}</p>
      <div class="row mt-2">
        <button class="btn grow" data-act="cancel">Abbrechen</button>
        <button class="btn btn-danger grow" data-act="ok">${esc(confirmLabel)}</button>
      </div>`);
    box.querySelector('[data-act="cancel"]').onclick = () => { closeSheet(); resolve(false); };
    box.querySelector('[data-act="ok"]').onclick = () => { closeSheet(); resolve(true); };
  });
}

export function statusChip(status, mini = false) {
  const s = STATUSES[status] || STATUSES.unentschieden;
  return `<span class="chip ${s.chip} ${mini ? 'status-mini' : ''}">${s.icon} ${s.label}</span>`;
}

export function catIcon(category) {
  return (CATEGORIES[category] || CATEGORIES.sonstiges).icon;
}

// ---------- Foto-Thumbnails ----------
// Vorschauen nutzen kleine Thumbnail-Blobs (~640px) statt der Originale:
// Ein 1568px-Foto kostet den Browser ~7 MB entpackten Bildspeicher pro <img> —
// bei vielen Karten läuft damit v.a. iOS Safari voll („Zu wenig Speicher“).
// Für ältere Fotos ohne Thumbnail wird es beim ersten Anzeigen erzeugt und
// gespeichert (reine Ergänzung — der Datensatz bleibt unangetastet).
//
// WICHTIG gegen das schleichende Volllaufen über eine lange Sitzung:
// Object-URLs werden generationsweise wieder freigegeben. Bei jedem
// Ansichtswechsel ruft der Router releaseStaleThumbs() auf; damit hält der
// Browser nur noch die Bilder der aktuellen (und der zuletzt verlassenen)
// Ansicht im Speicher, statt alle je gezeigten Fotos.
const urlCache = new Map();   // photoId → { url, gen }
const urlPending = new Map();
let photoGen = 0;

export function bumpPhotoGeneration() {
  photoGen++;
  for (const [id, entry] of urlCache) {
    if (entry.gen < photoGen - 1) {   // seit >1 Ansicht nicht mehr benutzt
      URL.revokeObjectURL(entry.url);
      urlCache.delete(id);
    }
  }
}

export function photoUrl(photoId) {
  if (!photoId) return Promise.resolve(null);
  const cached = urlCache.get(photoId);
  if (cached) { cached.gen = photoGen; return Promise.resolve(cached.url); }
  if (urlPending.has(photoId)) return urlPending.get(photoId);

  const promise = (async () => {
    const p = await db.get('photos', photoId);
    if (!p || !p.blob) return null;
    let blob = p.thumb;
    if (!blob) {
      try {
        blob = (await downscaleImage(p.blob, 512, 0.7)).blob;
        await db.put('photos', { ...p, thumb: blob });
      } catch {
        blob = p.blob; // Notfall: dann eben das Original
      }
    }
    const url = URL.createObjectURL(blob);
    urlCache.set(photoId, { url, gen: photoGen });
    return url;
  })();

  urlPending.set(photoId, promise);
  promise.finally(() => urlPending.delete(photoId));
  return promise;
}

/** Volle Auflösung (unkachiert) — Aufrufer muss die URL wieder freigeben. */
export async function photoFullUrl(photoId) {
  const p = await db.get('photos', photoId);
  return p?.blob ? URL.createObjectURL(p.blob) : null;
}

export async function itemThumb(item) {
  const url = item.photoIds?.length ? await photoUrl(item.photoIds[0]) : null;
  return url
    ? `<img src="${url}" alt="" loading="lazy">`
    : `<span>${catIcon(item.category)}</span>`;
}

export async function renderItemCard(item) {
  const thumb = await itemThumb(item);
  return `
    <a class="item-card" href="#/item/${item.id}">
      <div class="item-thumb">${thumb}
        <button class="hero-btn" data-hero="${item.id}" title="Neues Titelfoto aufnehmen" aria-label="Neues Titelfoto aufnehmen">📸</button>
      </div>
      <div class="item-card-body">
        <div class="item-card-name">${esc(item.name || 'Ohne Namen')}</div>
        <div class="item-card-meta">
          ${statusChip(item.status, true)}
          <span class="item-value">${item.value != null ? Math.round(item.value) + ' €' : ''}</span>
        </div>
      </div>
    </a>`;
}

/**
 * Foto (Datei/Blob) verkleinert + mit Thumbnail für einen Gegenstand speichern.
 * asCover: true → wird das neue Titelbild (Hero-Shot).
 */
export async function savePhotoForItem(itemId, fileOrBlob, { asCover = false } = {}) {
  const item = await db.get('items', itemId);
  if (!item) throw new Error('Gegenstand nicht gefunden');
  const { blob } = await downscaleImage(fileOrBlob);
  const thumb = (await downscaleImage(blob, 512, 0.7)).blob;
  const photo = { id: uid('ph'), itemId, blob, thumb, createdAt: new Date().toISOString() };
  await db.put('photos', photo);
  const photoIds = asCover ? [photo.id, ...(item.photoIds || [])] : [...(item.photoIds || []), photo.id];
  await db.put('items', { ...item, photoIds, updatedAt: new Date().toISOString() });
  return photo;
}

// ---------- Bildverkleinerung (speicherschonend) ----------
// Drei Schutzmechanismen gegen „Zu wenig Speicher“ (v.a. iOS Safari):
// 1. STRIKTE WARTESCHLANGE: Es läuft immer nur EINE Bildverarbeitung —
//    z.B. beim Nacherzeugen vieler Thumbnails sonst 20+ parallele Decodes.
// 2. Browser-internes Resize (createImageBitmap mit resizeWidth) — vermeidet
//    die riesige Vollauflösungs-Canvas, wo unterstützt.
// 3. Automatischer zweiter Versuch nach kurzer Pause, falls der Browser
//    gerade keinen Speicher freigeben konnte.
let imageQueue = Promise.resolve();
// Eine einzige, wiederverwendete Canvas — iOS Safari gibt den Grafikspeicher
// vieler einzeln erzeugter Canvas-Elemente nicht zuverlässig frei.
let sharedCanvas = null;
function getCanvas() {
  if (!sharedCanvas) sharedCanvas = document.createElement('canvas');
  return sharedCanvas;
}

export function downscaleImage(fileOrBlob, maxEdge = 1280, quality = 0.85) {
  const task = imageQueue.then(async () => {
    try {
      return await attemptDownscale(fileOrBlob, maxEdge, quality);
    } catch (err1) {
      await new Promise((r) => setTimeout(r, 800)); // Browser Speicher freigeben lassen
      try {
        return await attemptDownscale(fileOrBlob, Math.min(maxEdge, 1120), quality);
      } catch (err2) {
        throw new Error(`Bildverarbeitung fehlgeschlagen (${err2?.message || err1?.message || 'unbekannt'}) — bitte App einmal neu laden und erneut versuchen`);
      }
    }
  });
  imageQueue = task.catch(() => {});
  return task;
}

async function attemptDownscale(fileOrBlob, maxEdge, quality) {
  const canvas = getCanvas();
  let bmp = null, img = null, url = null;
  try {
    let source = null, w, h;

    // BESTER PFAD (spart auf iOS am meisten Speicher): Maße aus dem
    // Datei-Header lesen OHNE das Bild zu dekodieren, dann den Browser
    // direkt in Zielgröße dekodieren lassen. Ein 12–48-MP-Kamerabild wird
    // so NIE in voller Auflösung entpackt (das war der Speicher-Killer).
    const size = await readImageSize(fileOrBlob).catch(() => null);
    if (size && typeof createImageBitmap === 'function') {
      const scale = Math.min(1, maxEdge / Math.max(size.w, size.h));
      w = Math.max(1, Math.round(size.w * scale));
      h = Math.max(1, Math.round(size.h * scale));
      try {
        bmp = await createImageBitmap(fileOrBlob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
        source = bmp;
      } catch { bmp = null; } // Resize-Option nicht unterstützt → Fallback
    }

    // FALLBACK: klassisch über <img> dekodieren (nur wenn nötig)
    if (!source) {
      url = URL.createObjectURL(fileOrBlob);
      img = new Image();
      img.src = url;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
      });
      const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
      w = Math.max(1, Math.round(img.naturalWidth * scale));
      h = Math.max(1, Math.round(img.naturalHeight * scale));
      source = img;
    }

    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(source, 0, 0, w, h);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas-Export fehlgeschlagen'))), 'image/jpeg', quality));
    return { blob };
  } finally {
    canvas.width = 0; canvas.height = 0; // Canvas-Speicher sofort freigeben (iOS!)
    bmp?.close?.();
    if (img) img.src = '';               // dekodierte <img>-Daten freigeben
    if (url) URL.revokeObjectURL(url);
  }
}

// Bildmaße aus dem Datei-Header lesen (JPEG/PNG) — ohne Pixel zu dekodieren.
async function readImageSize(blob) {
  const buf = new Uint8Array(await blob.slice(0, 512 * 1024).arrayBuffer());
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    const w = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
    const h = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23];
    if (w > 0 && h > 0) return { w, h };
  }
  // JPEG: SOF-Marker suchen (enthält Höhe & Breite)
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xFF) { o++; continue; }
      const marker = buf[o + 1];
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        const h = (buf[o + 5] << 8) | buf[o + 6];
        const w = (buf[o + 7] << 8) | buf[o + 8];
        if (w > 0 && h > 0) return { w, h };
        break;
      }
      if (marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7)) { o += 2; continue; }
      const len = (buf[o + 2] << 8) | buf[o + 3];
      if (len < 2) break;
      o += 2 + len;
    }
  }
  return null; // z.B. HEIC → Fallback-Pfad dekodiert klassisch
}

/** Blob → reines Base64 (ohne data:-Präfix), z.B. für die KI-Analyse. */
export async function blobToBase64(blob) {
  const { blobToDataUrl } = await import('./db.js');
  return (await blobToDataUrl(blob)).split(',')[1];
}

// ---------- Speicher-Diagnose ----------
export async function storageReport() {
  const L = [];
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota) L.push(`Belegt: ${(est.usage / 1048576).toFixed(1)} MB von ${Math.round(est.quota / 1048576).toLocaleString('de-DE')} MB`);
    else L.push('Speicher-Schätzung: von diesem Browser nicht verfügbar');
  } catch { L.push('Speicher-Schätzung: Fehler'); }
  try { L.push(`Dauerhaft geschützt: ${(await navigator.storage?.persisted?.()) ? 'ja' : 'nein'}`); } catch { /* egal */ }
  try {
    const photos = await db.all('photos');
    const full = photos.reduce((s, p) => s + (p.blob?.size || 0), 0);
    const th = photos.reduce((s, p) => s + (p.thumb?.size || 0), 0);
    const items = await db.all('items');
    L.push(`Gegenstände: ${items.length} · Fotos: ${photos.length}`);
    L.push(`Fotos gespeichert: ${(full / 1048576).toFixed(1)} MB + Thumbs ${(th / 1048576).toFixed(1)} MB`);
    L.push(`Ohne Thumbnail: ${photos.filter((p) => !p.thumb).length}`);
  } catch { L.push('Foto-Zählung: Fehler'); }
  if (performance?.memory) L.push(`JS-Speicher: ${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB von ${Math.round(performance.memory.jsHeapSizeLimit / 1048576)} MB`);
  L.push(`Anzeige: ${screen?.width || '?'}×${screen?.height || '?'} @${devicePixelRatio || 1}x`);
  L.push(`Browser: ${navigator.userAgent}`);
  return L.join('\n');
}

/** Fehler bei Foto-Operationen sichtbar melden — mit Details zum Kopieren. */
export async function reportPhotoError(err) {
  const detail = `Fehler: ${err?.name || 'Error'}: ${err?.message || err}\n${await storageReport()}`;
  const box = sheet(`
    <h3>⚠️ Foto konnte nicht gespeichert werden</h3>
    <p class="small muted">Damit ich das beheben kann, kopiere bitte diese Infos und schick sie mir:</p>
    <pre class="input" style="white-space:pre-wrap; word-break:break-word; font-size:.78rem; max-height:38dvh; overflow:auto">${esc(detail)}</pre>
    <div class="row mt-2">
      <button class="btn grow" id="pe-copy">📋 Infos kopieren</button>
      <button class="btn btn-primary grow" id="pe-reload">🔄 App neu laden</button>
    </div>`);
  box.querySelector('#pe-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(detail); toast('Kopiert 📋 — bitte an den Support schicken'); }
    catch { toast('Bitte den Text oben markieren und kopieren'); }
  };
  box.querySelector('#pe-reload').onclick = () => location.reload();
  return detail;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
