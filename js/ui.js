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

// Bild verkleinern (max. Kante), als JPEG-Blob + DataURL für die KI.
export async function downscaleImage(fileOrBlob, maxEdge = 1568, quality = 0.85) {
  const bmp = await createImageBitmap(fileOrBlob);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  bmp.close?.();
  return { blob, dataUrl, base64: dataUrl.split(',')[1] };
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
