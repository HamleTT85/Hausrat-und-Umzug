// Verkaufsliste als PDF — läuft komplett lokal auf dem Gerät und nutzt die
// echten Fotos aus der Datenbank. jsPDF wird nur bei Bedarf geladen.
import { db, blobToDataUrl } from './db.js';
import { downscaleImage } from './ui.js';

let jspdfPromise = null;
function loadJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!jspdfPromise) {
    jspdfPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/jspdf.umd.min.js';
      s.onload = () => resolve(window.jspdf.jsPDF);
      s.onerror = () => reject(new Error('PDF-Bibliothek konnte nicht geladen werden'));
      document.head.appendChild(s);
    });
  }
  return jspdfPromise;
}

function euro(v) {
  if (v == null || v === '' || isNaN(v)) return '–';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
}

async function itemImage(it) {
  if (!it.photoIds?.length) return null;
  const p = await db.get('photos', it.photoIds[0]);
  if (!p?.blob) return null;
  try {
    const printBlob = (await downscaleImage(p.blob, 900, 0.8)).blob;
    const dataUrl = await blobToDataUrl(printBlob);
    const size = await new Promise((res) => {
      const i = new Image();
      i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
      i.onerror = () => res(null);
      i.src = dataUrl;
    });
    return size ? { dataUrl, ...size } : null;
  } catch { return null; }
}

function priceLine(it) {
  const price = it.sale?.price ?? it.value;
  const qty = it.quantity || 1;
  if (price == null) return 'Preis auf Anfrage';
  if (qty > 1) return `${euro(price)} je Stück · ${qty} Stück · zusammen ${euro(price * qty)}`;
  return `${euro(price)}`;
}

/**
 * Baut die Verkaufs-PDF aus den übergebenen Gegenständen.
 * @returns {Promise<{blob: Blob, filename: string}>}
 */
export async function generateSalesPdf(items, opts = {}) {
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const pageW = 210, pageH = 297, margin = 15;
  const contentW = pageW - margin * 2;
  const imgW = 52, imgMaxH = 42;
  const accent = [192, 94, 47];   // Terrakotta
  const gray = [120, 110, 95];
  const dark = [43, 36, 28];

  // Fotos + Maße vorbereiten
  const prepared = [];
  for (const it of items) prepared.push({ it, img: await itemImage(it) });

  const total = items.reduce((s, it) => s + ((Number(it.sale?.price ?? it.value) || 0) * (it.quantity || 1)), 0);

  // ---- Kopf ----
  let y = margin;
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...dark); doc.setFontSize(24);
  doc.text(opts.title || 'Zu verkaufen', margin, y + 6);
  y += 11;
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...gray); doc.setFontSize(10.5);
  const sub = `${new Date().toLocaleDateString('de-DE')} · ${items.length} ${items.length === 1 ? 'Gegenstand' : 'Gegenstände'} · zusammen ca. ${euro(total)}`;
  doc.text(sub, margin, y);
  if (opts.contact) { y += 5; doc.text(opts.contact, margin, y); }
  y += 4;
  doc.setDrawColor(226, 218, 203); doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 7;

  // ---- Gegenstände ----
  for (const { it, img } of prepared) {
    const textX = margin + imgW + 6;
    const textW = contentW - imgW - 6;

    // Bildmaße (in Box einpassen)
    let drawW = 0, drawH = 0;
    if (img) {
      const scale = Math.min(imgW / img.w, imgMaxH / img.h);
      drawW = img.w * scale; drawH = img.h * scale;
    }

    // Texthöhe abschätzen
    const name = it.name || 'Ohne Namen';
    const desc = (it.sale?.description || it.notes || '').trim();
    doc.setFontSize(13); const nameLines = doc.splitTextToSize(name, textW);
    doc.setFontSize(10); const descLines = desc ? doc.splitTextToSize(desc, textW) : [];
    const textH = nameLines.length * 6 + 6 /*price*/ + 5 /*meta*/ + descLines.length * 4.6 + 2;
    const blockH = Math.max(drawH, textH) + 8;

    // Seitenumbruch
    if (y + blockH > pageH - margin) { doc.addPage(); y = margin; }

    // Bild
    if (img) {
      try { doc.addImage(img.dataUrl, 'JPEG', margin, y, drawW, drawH, undefined, 'FAST'); }
      catch { /* Bild übersprungen */ }
    } else {
      doc.setFillColor(244, 240, 232); doc.rect(margin, y, imgW, imgMaxH, 'F');
      doc.setTextColor(...gray); doc.setFontSize(9);
      doc.text('kein Foto', margin + imgW / 2, y + imgMaxH / 2, { align: 'center' });
    }

    // Text
    let ty = y + 4;
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...dark); doc.setFontSize(13);
    doc.text(nameLines, textX, ty); ty += nameLines.length * 6 + 1;
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...accent); doc.setFontSize(12);
    doc.text(priceLine(it), textX, ty); ty += 6;
    const room = opts.roomName?.(it) || '';
    if (room) { doc.setFont('helvetica', 'normal'); doc.setTextColor(...gray); doc.setFontSize(9); doc.text(`Standort: ${room}`, textX, ty); ty += 5; }
    if (descLines.length) { doc.setFont('helvetica', 'normal'); doc.setTextColor(...dark); doc.setFontSize(10); doc.text(descLines, textX, ty); }

    y += blockH;
    doc.setDrawColor(238, 232, 222); doc.setLineWidth(0.2);
    doc.line(margin, y - 4, pageW - margin, y - 4);
  }

  // Fußzeile mit Seitenzahlen
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...gray); doc.setFontSize(8);
    doc.text(`Seite ${i} / ${pages}`, pageW - margin, pageH - 8, { align: 'right' });
    doc.text('Erstellt mit HausRat', margin, pageH - 8);
  }

  const blob = doc.output('blob');
  const filename = `verkaufsliste-${new Date().toISOString().slice(0, 10)}.pdf`;
  return { blob, filename };
}
