// App-Einstieg: Hash-Router, Theme, Navigation, Hero-Shot.
import { closeSheet, toast, savePhotoForItem, bumpPhotoGeneration, reportPhotoError } from './ui.js';
import { getMeta, setMeta } from './db.js';

import { renderDashboard } from './views/dashboard.js';
import { renderBrowse } from './views/browse.js';
import { renderItem } from './views/item.js';
import { renderCapture } from './views/capture.js';
import { renderSearch } from './views/search.js';
import { renderMove } from './views/move.js';
import { renderSell } from './views/sell.js';
import { renderDuplicates } from './views/duplicates.js';
import { renderDecide } from './views/decide.js';
import { renderSettings } from './views/settings.js';
import { renderScan } from './views/scan.js';

const routes = [
  { pattern: /^#?\/?$/,                view: renderDashboard, nav: 'home' },
  { pattern: /^#\/browse(?:\/(.*))?$/, view: renderBrowse,    nav: 'browse' },
  { pattern: /^#\/item\/(.+)$/,        view: renderItem,      nav: 'browse' },
  { pattern: /^#\/capture(?:\?(.*))?$/, view: renderCapture,  nav: 'capture' },
  { pattern: /^#\/search$/,            view: renderSearch,    nav: 'search' },
  { pattern: /^#\/move$/,              view: renderMove,      nav: 'move' },
  { pattern: /^#\/sell$/,              view: renderSell,      nav: 'move' },
  { pattern: /^#\/duplicates$/,        view: renderDuplicates, nav: 'move' },
  { pattern: /^#\/decide$/,            view: renderDecide,    nav: 'move' },
  { pattern: /^#\/settings$/,          view: renderSettings,  nav: null },
  { pattern: /^#\/scan$/,              view: renderScan,      nav: null },
];

async function route() {
  closeSheet();
  bumpPhotoGeneration(); // Bildspeicher der vorletzten Ansicht freigeben
  const hash = location.hash || '#/';
  const container = document.getElementById('view');
  for (const r of routes) {
    const m = hash.match(r.pattern);
    if (m) {
      highlightNav(r.nav);
      container.classList.remove('view');
      void container.offsetWidth; // Animation neu starten
      container.classList.add('view');
      try {
        await r.view(container, m[1]);
      } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="empty"><div class="empty-ico">😵</div>
          <div class="empty-title">Da ist etwas schiefgelaufen</div>
          <p>${err?.message || err}</p></div>`;
      }
      container.scrollTop = 0;
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#/';
}

function highlightNav(nav) {
  document.querySelectorAll('.bottombar a').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === nav);
  });
}

// ---------- Theme ----------
async function initTheme() {
  const saved = await getMeta('theme');
  const preferred = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = preferred;
  document.getElementById('theme-toggle').addEventListener('click', async () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    await setMeta('theme', next);
  });
}

// ---------- Hero-Shot: 📸 auf einer Item-Karte → neues Titelfoto ----------
function initHeroShot() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.setAttribute('capture', 'environment');
  input.style.display = 'none';
  document.body.appendChild(input);

  let targetId = null;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-hero]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    targetId = btn.dataset.hero;
    input.click();
  }, true);

  input.onchange = async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file || !targetId) return;
    try {
      await savePhotoForItem(targetId, file, { asCover: true });
      toast('Neues Titelfoto gespeichert 📸');
      route(); // aktuelle Ansicht mit dem neuen Bild neu aufbauen
    } catch (err) {
      await reportPhotoError(err);
    }
  };
}

window.addEventListener('hashchange', route);
initTheme().then(route);
initHeroShot();

// Browser bitten, unsere Daten dauerhaft zu behalten (verhindert Löschung
// bei Speicherdruck und erhöht auf manchen Geräten das Kontingent).
navigator.storage?.persist?.().catch(() => {});
