// Suche & Filter über den gesamten Bestand.
import { db } from '../db.js';
import { CATEGORIES, STATUSES, PRIORITIES } from '../data.js';
import { esc, renderItemCard, debounce } from '../ui.js';

export async function renderSearch(container) {
  const [items, rooms, houses] = await Promise.all([
    db.all('items'), db.all('rooms'), db.all('houses'),
  ]);
  const roomById = Object.fromEntries(rooms.map((r) => [r.id, r]));

  const state = {
    q: '',
    status: sessionStorage.getItem('searchStatus') || '',
    category: sessionStorage.getItem('searchCat') || '',
    priority: '',
    house: '',
  };
  sessionStorage.removeItem('searchStatus');
  sessionStorage.removeItem('searchCat');

  container.innerHTML = `
    <h1 class="page-title">🔍 <em>Suchen</em> & filtern</h1>
    <div class="field">
      <input class="input" id="s-q" placeholder="Name, Material, Notizen …" type="search">
    </div>
    <div class="field-grid">
      <div class="field"><label>Status</label>
        <select class="input" id="s-status">
          <option value="">Alle</option>
          ${Object.entries(STATUSES).map(([k, s]) => `<option value="${k}">${s.icon} ${s.label}</option>`).join('')}
        </select></div>
      <div class="field"><label>Kategorie</label>
        <select class="input" id="s-cat">
          <option value="">Alle</option>
          ${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}">${c.icon} ${c.label}</option>`).join('')}
        </select></div>
      <div class="field"><label>Priorität</label>
        <select class="input" id="s-prio">
          <option value="">Alle</option>
          ${Object.entries(PRIORITIES).map(([k, p]) => `<option value="${k}">${p.icon} ${p.label}</option>`).join('')}
        </select></div>
      <div class="field"><label>Standort</label>
        <select class="input" id="s-house">
          <option value="">Überall</option>
          ${houses.map((h) => `<option value="${h.id}">${esc(h.icon)} ${esc(h.name)}</option>`).join('')}
        </select></div>
    </div>
    <div id="s-results" class="mt-1"></div>
  `;

  if (state.status) container.querySelector('#s-status').value = state.status;
  if (state.category) container.querySelector('#s-cat').value = state.category;

  const results = container.querySelector('#s-results');

  async function apply() {
    const q = state.q.toLowerCase();
    const filtered = items.filter((it) => {
      if (state.status && it.status !== state.status) return false;
      if (state.category && it.category !== state.category) return false;
      if (state.priority && it.priority !== state.priority) return false;
      if (state.house && roomById[it.roomId]?.houseId !== state.house) return false;
      if (q) {
        const hay = `${it.name} ${it.material} ${it.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (!filtered.length) {
      results.innerHTML = `<div class="empty"><div class="empty-ico">🔎</div>
        <div class="empty-title">Nichts gefunden</div><p>Andere Suchbegriffe oder Filter probieren.</p></div>`;
      return;
    }
    const cards = await Promise.all(filtered.map(renderItemCard));
    results.innerHTML = `
      <p class="small muted">${filtered.length} Treffer</p>
      <div class="item-grid">${cards.join('')}</div>`;
  }

  const onInput = debounce(() => { state.q = container.querySelector('#s-q').value; apply(); }, 200);
  container.querySelector('#s-q').addEventListener('input', onInput);
  container.querySelector('#s-status').onchange = (e) => { state.status = e.target.value; apply(); };
  container.querySelector('#s-cat').onchange = (e) => { state.category = e.target.value; apply(); };
  container.querySelector('#s-prio').onchange = (e) => { state.priority = e.target.value; apply(); };
  container.querySelector('#s-house').onchange = (e) => { state.house = e.target.value; apply(); };

  apply();
}
