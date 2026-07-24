// UI-Helfer: HTML-Rendering, Toasts, Bottom-Sheets, Thumbnails.
import { db } from './db.js';
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

// ---------- Foto-Thumbnails (Object-URLs mit Cache) ----------
const urlCache = new Map();

export async function photoUrl(photoId) {
  if (!photoId) return null;
  if (urlCache.has(photoId)) return urlCache.get(photoId);
  const p = await db.get('photos', photoId);
  if (!p || !p.blob) return null;
  const url = URL.createObjectURL(p.blob);
  urlCache.set(photoId, url);
  return url;
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
      <div class="item-thumb">${thumb}</div>
      <div class="item-card-body">
        <div class="item-card-name">${esc(item.name || 'Ohne Namen')}</div>
        <div class="item-card-meta">
          ${statusChip(item.status, true)}
          <span class="item-value">${item.value != null ? Math.round(item.value) + ' €' : ''}</span>
        </div>
      </div>
    </a>`;
}

// Bild verkleinern (max. Kante) → kompakter JPEG-Blob.
// Wichtig für iOS Safari: Canvas-Speicher wird dort erst beim Nullsetzen der
// Maße freigegeben — ohne das schlägt schon das zweite Kamerafoto mit einem
// „Zu wenig Speicher“-Fehler fehl.
export async function downscaleImage(fileOrBlob, maxEdge = 1568, quality = 0.85) {
  const { source, width, height, cleanup } = await decodeImage(fileOrBlob);
  const canvas = document.createElement('canvas');
  try {
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht verarbeitet werden'))), 'image/jpeg', quality));
    return { blob };
  } finally {
    canvas.width = 0; canvas.height = 0; // Canvas-Speicher sofort freigeben (iOS!)
    cleanup();
  }
}

async function decodeImage(fileOrBlob) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(fileOrBlob);
      return { source: bmp, width: bmp.width, height: bmp.height, cleanup: () => bmp.close?.() };
    } catch { /* Fallback über <img> unten */ }
  }
  const url = URL.createObjectURL(fileOrBlob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    if (img.decode) await img.decode();
    else await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden')); });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, cleanup: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
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
