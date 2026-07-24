// App-Einstieg: Hash-Router, Theme, Navigation.
import { closeSheet } from './ui.js';
import { getMeta, setMeta } from './db.js';

import { renderDashboard } from './views/dashboard.js';
import { renderBrowse } from './views/browse.js';
import { renderItem } from './views/item.js';
import { renderCapture } from './views/capture.js';
import { renderSearch } from './views/search.js';
import { renderMove } from './views/move.js';
import { renderSell } from './views/sell.js';
import { renderDuplicates } from './views/duplicates.js';
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
  { pattern: /^#\/settings$/,          view: renderSettings,  nav: null },
  { pattern: /^#\/scan$/,              view: renderScan,      nav: null },
];

async function route() {
  closeSheet();
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

window.addEventListener('hashchange', route);
initTheme().then(route);
