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
const urlCache = new Map();
const urlPending = new Map();

export function photoUrl(photoId) {
  if (!photoId) return Promise.resolve(null);
  if (urlCache.has(photoId)) return Promise.resolve(urlCache.get(photoId));
  if (urlPending.has(photoId)) return urlPending.get(photoId);

  const promise = (async () => {
    const p = await db.get('photos', photoId);
    if (!p || !p.blob) return null;
    let blob = p.thumb;
    if (!blob) {
      try {
        blob = (await downscaleImage(p.blob, 640, 0.72)).blob;
        await db.put('photos', { ...p, thumb: blob });
      } catch {
        blob = p.blob; // Notfall: dann eben das Original
      }
    }
    const url = URL.createObjectURL(blob);
    urlCache.set(photoId, url);
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
  const thumb = (await downscaleImage(blob, 640, 0.72)).blob;
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

export function downscaleImage(fileOrBlob, maxEdge = 1568, quality = 0.85) {
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
  const url = URL.createObjectURL(fileOrBlob);
  const img = new Image();
  const canvas = document.createElement('canvas');
  let bmp = null;
  try {
    // 1. Maße günstig ermitteln (liest nur den Bild-Header)
    img.src = url;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
    });
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    // 2. Bevorzugt browser-intern verkleinern (kein Vollbild im Canvas nötig)
    let source = null;
    if (typeof createImageBitmap === 'function') {
      try {
        bmp = await createImageBitmap(fileOrBlob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
        source = bmp;
      } catch { /* Resize-Optionen nicht unterstützt → <img>-Pfad */ }
    }
    if (!source) source = img;

    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(source, 0, 0, w, h);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas-Export fehlgeschlagen'))), 'image/jpeg', quality));
    return { blob };
  } finally {
    canvas.width = 0; canvas.height = 0; // Canvas-Speicher sofort freigeben (iOS!)
    bmp?.close?.();
    img.src = '';                        // dekodierte Bilddaten der <img> freigeben
    URL.revokeObjectURL(url);
  }
}

/** Blob → reines Base64 (ohne data:-Präfix), z.B. für die KI-Analyse. */
export async function blobToBase64(blob) {
  const { blobToDataUrl } = await import('./db.js');
  return (await blobToDataUrl(blob)).split(',')[1];
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
