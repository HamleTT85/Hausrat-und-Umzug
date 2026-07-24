// Gemeinsam entscheiden: Deko, Spielzeug & Co. — zwei Personen geben pro
// Gegenstand ihren Wunsch ab. Einigkeit wird automatisch übernommen,
// Uneinigkeit landet gut sichtbar in der Klärungsliste.
import { db, setMeta } from '../db.js';
import { CATEGORIES, WISH_CHOICES, getMovePlan } from '../data.js';
import { esc, sheet, closeSheet, toast, itemThumb, statusChip } from '../ui.js';

const DECIDE_CATS = [
  { id: 'deko',      label: '🖼️ Deko' },
  { id: 'spielzeug', label: '🧸 Spielzeug' },
  { id: 'kueche',    label: '🍽️ Küche' },
  { id: '',          label: '📦 Alles' },
];

export async function renderDecide(container) {
  const [items, plan] = await Promise.all([db.all('items'), getMovePlan()]);
  const [p1, p2] = plan.people;
  const cat = sessionStorage.getItem('decideCat') ?? 'deko';

  const pool = items.filter((it) => (!cat || it.category === cat));
  const evaluated = pool.map((it) => ({ it, state: wishState(it, p1, p2) }));
  const conflict = evaluated.filter((e) => e.state.kind === 'conflict');
  const open = evaluated.filter((e) => e.state.kind === 'open');
  const agreed = evaluated.filter((e) => e.state.kind === 'agreed');

  container.innerHTML = `
    <div class="crumbs"><a href="#/move">Umzug</a><span class="sep">›</span><span>Gemeinsam entscheiden</span></div>
    <h1 class="page-title">🤝 <em>Gemeinsam</em> entscheiden</h1>
    <p class="page-sub">Gerade bei Deko sieht das jede:r anders. Gebt beide euren Wunsch ab — bei Einigkeit wird’s sofort übernommen, sonst wandert es in die Klärungsliste.</p>

    <div class="row-between mb-1">
      <div class="chip-row">
        <span class="chip chip-accent">👤 ${esc(p1)}</span>
        <span class="chip chip-info">👤 ${esc(p2)}</span>
      </div>
      <button class="btn btn-s" id="edit-people">✏️ Namen</button>
    </div>

    <div class="segment mb-2" id="decide-cat">
      ${DECIDE_CATS.map((c) => `<button data-cat="${c.id}" class="${c.id === cat ? 'active' : ''}">${c.label}</button>`).join('')}
    </div>

    ${!pool.length ? `
      <div class="empty"><div class="empty-ico">🖼️</div>
        <div class="empty-title">Hier ist noch nichts</div>
        <p>Sobald Gegenstände in dieser Kategorie erfasst sind, könnt ihr sie hier abstimmen.</p>
        <a class="btn btn-primary" href="#/capture">📸 Erfassen</a></div>` : `

      ${conflict.length ? `
        <div class="card-title">☕ Klärungsbedarf (${conflict.length}) — kurz drüber reden!</div>
        <div class="stack mb-2" id="sec-conflict"></div>` : ''}

      ${open.length ? `
        <div class="card-title">🗳️ Noch abstimmen (${open.length})</div>
        <div class="stack mb-2" id="sec-open"></div>` : ''}

      ${agreed.length ? `
        <details class="mt-1">
          <summary class="card-title" style="cursor:pointer">✅ Entschieden (${agreed.length})</summary>
          <div class="stack mt-1" id="sec-agreed"></div>
        </details>` : ''}
    `}
  `;

  // Kategorie-Umschalter
  container.querySelectorAll('#decide-cat button').forEach((b) => b.onclick = () => {
    sessionStorage.setItem('decideCat', b.dataset.cat);
    renderDecide(container);
  });

  // Personen umbenennen
  container.querySelector('#edit-people').onclick = () => {
    const box = sheet(`
      <h3>Wer entscheidet mit?</h3>
      <div class="field"><label>Person 1</label><input class="input" id="pp1" value="${esc(p1)}"></div>
      <div class="field"><label>Person 2</label><input class="input" id="pp2" value="${esc(p2)}"></div>
      <div class="row mt-2">
        <button class="btn grow" id="pp-cancel">Abbrechen</button>
        <button class="btn btn-primary grow" id="pp-save">Speichern</button>
      </div>`);
    box.querySelector('#pp-cancel').onclick = closeSheet;
    box.querySelector('#pp-save').onclick = async () => {
      const n1 = box.querySelector('#pp1').value.trim() || 'Ich';
      const n2 = box.querySelector('#pp2').value.trim() || 'Partnerin';
      // Wünsche auf die neuen Namen umziehen
      for (const it of items) {
        if (!it.wishes) continue;
        const w = { ...it.wishes };
        if (p1 in w && n1 !== p1) { w[n1] = w[p1]; delete w[p1]; }
        if (p2 in w && n2 !== p2) { w[n2] = w[p2]; delete w[p2]; }
        await db.put('items', { ...it, wishes: w });
      }
      plan.people = [n1, n2];
      await setMeta('movePlan', plan);
      closeSheet(); renderDecide(container);
    };
  };

  // Karten rendern
  async function fillSection(id, entries) {
    const host = container.querySelector(id);
    if (!host) return;
    const cards = await Promise.all(entries.map((e) => itemCard(e.it, e.state)));
    host.innerHTML = cards.join('');
  }
  await fillSection('#sec-conflict', conflict);
  await fillSection('#sec-open', open);
  await fillSection('#sec-agreed', agreed);

  async function itemCard(it, state) {
    const thumb = await itemThumb(it);
    const wishes = it.wishes || {};
    const banner =
      state.kind === 'conflict'
        ? `<div class="chip chip-danger" style="margin-top:8px">⚡ ${esc(p1)}: ${wishLabel(wishes[p1])} · ${esc(p2)}: ${wishLabel(wishes[p2])}</div>`
        : state.kind === 'agreed'
          ? `<div class="chip chip-ok" style="margin-top:8px">✅ Einig: ${wishLabel(state.choice)}</div>`
          : '';
    return `
      <div class="card" data-item="${it.id}">
        <div class="row" style="align-items:flex-start">
          <a class="nav-row-ico" href="#/item/${it.id}" style="overflow:hidden;padding:0">${thumb}</a>
          <div class="grow">
            <div class="row-between">
              <b>${esc(it.name || 'Ohne Namen')}</b>
              ${statusChip(it.status, true)}
            </div>
            ${[p1, p2].map((person, pi) => `
              <div class="row mt-1" style="flex-wrap:wrap; gap:4px">
                <span class="small ${pi === 0 ? 'chip chip-accent' : 'chip chip-info'} status-mini">${esc(person)}</span>
                ${Object.entries(WISH_CHOICES).map(([k, c]) =>
                  `<button class="chip chip-select status-mini ${wishes[person] === k ? 'selected' : ''}"
                     data-wish="${it.id}|${esc(person)}|${k}">${c.icon} ${c.label}</button>`).join('')}
              </div>`).join('')}
            ${banner}
          </div>
        </div>
      </div>`;
  }

  // Wunsch antippen
  container.querySelectorAll('[data-wish]').forEach((b) => b.onclick = async () => {
    const [itemId, person, choice] = b.dataset.wish.split('|');
    const it = await db.get('items', itemId);
    const wishes = { ...(it.wishes || {}) };
    wishes[person] = wishes[person] === choice ? undefined : choice;
    if (!wishes[person]) delete wishes[person];

    let upd = { ...it, wishes, updatedAt: new Date().toISOString() };
    const state = wishState(upd, p1, p2);

    // Einigkeit → sofort anwenden
    if (state.kind === 'agreed') {
      const apply = WISH_CHOICES[state.choice]?.apply;
      if (apply) {
        upd = { ...upd, status: apply.status, destination: apply.destination };
        toast(`Einig! ${WISH_CHOICES[state.choice].icon} ${WISH_CHOICES[state.choice].label} — übernommen ✅`);
      }
    } else if (state.kind === 'conflict') {
      toast('Uneinig — ab in die Klärungsliste ☕', 2200);
    }
    await db.put('items', upd);
    renderDecide(container);
  });
}

/** Zustand eines Gegenstands aus Sicht der beiden Personen. */
function wishState(it, p1, p2) {
  const w = it.wishes || {};
  const a = w[p1], b = w[p2];
  if (!a || !b) return { kind: 'open' };
  if (a === 'egal' && b === 'egal') return { kind: 'open' };
  const real = [a, b].filter((x) => x !== 'egal');
  const uniq = [...new Set(real)];
  if (uniq.length === 1) return { kind: 'agreed', choice: uniq[0] };
  return { kind: 'conflict' };
}

function wishLabel(choice) {
  const c = WISH_CHOICES[choice];
  return c ? `${c.icon} ${c.label}` : '—';
}
