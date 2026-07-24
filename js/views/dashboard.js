// Startseite: Überblick, Statistiken, Schnellzugriffe.
import { db, getMeta } from '../db.js';
import { STATUSES, CATEGORIES, fmtEuro } from '../data.js';
import { esc, renderItemCard, statusChip } from '../ui.js';

export async function renderDashboard(container) {
  const [items, rooms, houses, plan] = await Promise.all([
    db.all('items'), db.all('rooms'), db.all('houses'), getMeta('movePlan'),
  ]);

  const totalValue = items.reduce((s, it) => s + (Number(it.value) || 0), 0);
  const byStatus = {};
  for (const it of items) byStatus[it.status] = (byStatus[it.status] || 0) + 1;
  const byCat = {};
  for (const it of items) byCat[it.category] = (byCat[it.category] || 0) + 1;

  const undecided = byStatus.unentschieden || 0;
  const sellValue = items.filter((i) => i.status === 'verkaufen').reduce((s, it) => s + (Number(it.value) || 0), 0);

  const daysLeft = plan?.date ? Math.ceil((new Date(plan.date) - new Date()) / 86400000) : null;

  const recent = [...items].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 4);
  const recentCards = await Promise.all(recent.map(renderItemCard));

  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';

  container.innerHTML = `
    <h1 class="page-title">${greet}! <em>Dein Zuhause</em> im Blick.</h1>
    <p class="page-sub">${items.length ? `${items.length} Gegenstände in ${rooms.length} Räumen erfasst.` : 'Starte mit deinem ersten Foto — die KI erledigt den Rest.'}</p>

    ${daysLeft != null ? `
      <a class="card card-link mb-2" href="#/move">
        <div class="row-between">
          <div>
            <div class="countdown">${daysLeft > 0 ? daysLeft : '🎉'}</div>
            <div class="muted small">${daysLeft > 1 ? 'Tage bis zum Umzug' : daysLeft === 1 ? 'Tag bis zum Umzug' : daysLeft === 0 ? 'Heute ist Umzugstag!' : 'Umzug geschafft!'}</div>
          </div>
          <span style="font-size:2.4rem">🚚</span>
        </div>
      </a>` : ''}

    <div class="stat-grid mb-2">
      <div class="stat-tile"><div class="stat-num">${items.length}</div><div class="stat-label">📦 Gegenstände</div></div>
      <div class="stat-tile"><div class="stat-num">${fmtEuro(totalValue)}</div><div class="stat-label">💎 Gesamtwert</div></div>
      <a class="stat-tile card-link" href="#/sell"><div class="stat-num">${fmtEuro(sellValue)}</div><div class="stat-label">💰 Verkaufswert</div></a>
      <div class="stat-tile"><div class="stat-num">${undecided}</div><div class="stat-label">🤔 Unentschieden</div></div>
    </div>

    ${items.length ? `
    <div class="card mb-2">
      <div class="card-title">📊 Status-Verteilung</div>
      <div class="chip-row">
        ${Object.entries(byStatus)
          .sort((a, b) => b[1] - a[1])
          .map(([s, n]) => `<a href="#/search" data-status="${esc(s)}">${statusChip(s)} <b class="small">${n}</b></a>`)
          .join('')}
      </div>
    </div>` : ''}

    ${items.length ? `
    <div class="card mb-2">
      <div class="card-title">🗂️ Kategorien</div>
      <div class="chip-row">
        ${Object.entries(byCat)
          .sort((a, b) => b[1] - a[1])
          .map(([c, n]) => {
            const cat = CATEGORIES[c] || CATEGORIES.sonstiges;
            return `<a class="chip" href="#/search" data-cat="${esc(c)}">${cat.icon} ${cat.label} <b class="small">${n}</b></a>`;
          }).join('')}
      </div>
    </div>` : ''}

    ${!houses.length ? `
      <div class="empty card">
        <div class="empty-ico">🏠</div>
        <div class="empty-title">Noch ganz leer hier</div>
        <p>Lege dein erstes Haus oder deine Wohnung an — oder lade Beispieldaten zum Ausprobieren.</p>
        <div class="stack">
          <a class="btn btn-primary btn-block" href="#/browse">🏡 Erstes Zuhause anlegen</a>
          <a class="btn btn-block" href="#/settings">🧪 Beispieldaten laden</a>
        </div>
      </div>` : `
      <div class="row mb-2">
        <a class="btn btn-primary grow" href="#/capture">📸 Foto erfassen</a>
        <a class="btn grow" href="#/browse">🗄️ Bestand ansehen</a>
      </div>`}

    ${recent.length ? `
      <div class="card-title mt-2">🕐 Zuletzt bearbeitet</div>
      <div class="item-grid">${recentCards.join('')}</div>` : ''}
  `;

  // Status-/Kategorie-Chips führen zur vorgefilterten Suche
  container.querySelectorAll('[data-status]').forEach((a) => {
    a.addEventListener('click', () => {
      sessionStorage.setItem('searchStatus', a.dataset.status);
    });
  });
  container.querySelectorAll('[data-cat]').forEach((a) => {
    a.addEventListener('click', () => {
      sessionStorage.setItem('searchCat', a.dataset.cat);
    });
  });
}
