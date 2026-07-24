// Duplikat-Klärung: Gleichartiges aus beiden Haushalten clustern,
// dann pro Gruppe entscheiden, was bleibt und was wegkommt.
import { db, getMeta, setMeta } from '../db.js';
import { CATEGORIES, CONDITIONS, fmtEuro, getMovePlan } from '../data.js';
import { esc, toast, itemThumb, statusChip } from '../ui.js';
import { clusterDuplicates, getAiSettings } from '../ai.js';

const LOSER_ACTIONS = {
  entsorgen:   { label: '🗑️ Entsorgen',   status: 'entsorgen' },
  verschenken: { label: '🎁 Verschenken', status: 'verschenken' },
  verkaufen:   { label: '💰 Verkaufen',   status: 'verkaufen' },
};

export async function renderDuplicates(container) {
  const [items, rooms, houses, saved] = await Promise.all([
    db.all('items'), db.all('rooms'), db.all('houses'), getMeta('dupClusters'),
  ]);
  const { apiKey } = await getAiSettings();
  const roomById = Object.fromEntries(rooms.map((r) => [r.id, r]));
  const houseById = Object.fromEntries(houses.map((h) => [h.id, h]));
  const itemById = Object.fromEntries(items.map((it) => [it.id, it]));
  const houseOf = (it) => houseById[roomById[it.roomId]?.houseId];

  // Gespeicherte KI-Cluster (nur noch gültige, unaufgelöste anzeigen)
  const clusters = (saved?.clusters || [])
    .map((c) => ({ ...c, itemIds: c.itemIds.filter((id) => itemById[id]) }))
    .filter((c) => !c.resolved && c.itemIds.length >= 2);

  // Lokale Schnell-Vorschau ohne KI: gleiche Kategorie + ähnlicher Name
  const heuristic = clusters.length ? [] : heuristicClusters(items);

  container.innerHTML = `
    <div class="crumbs"><a href="#/move">Umzug</a><span class="sep">›</span><span>Doppelte Dinge</span></div>
    <h1 class="page-title">👯 <em>Doppelt?</em> Entscheide schnell.</h1>
    <p class="page-sub">Zwei Haushalte bedeuten doppelte Teller, Töpfe, Kaffeemaschinen … Hier werden sie gruppiert — du tippst pro Gruppe, welches Stück gewinnt.</p>

    <div class="row mb-2">
      <button class="btn btn-primary grow" id="dup-ai" ${!apiKey ? 'disabled' : ''}>✨ KI: Duplikate finden${clusters.length ? ' (neu)' : ''}</button>
    </div>
    ${!apiKey ? '<p class="small muted mb-2">Für die KI-Suche brauchst du einen API-Key (⚙️ Einstellungen). Die einfache Namens-Vorschau unten funktioniert auch ohne.</p>' : ''}

    <div id="dup-list" class="stack"></div>
  `;

  const list = container.querySelector('#dup-list');

  async function renderClusterCards(clusterArr, isAi) {
    if (!clusterArr.length) {
      list.innerHTML = `<div class="empty"><div class="empty-ico">🎉</div>
        <div class="empty-title">Keine offenen Dubletten</div>
        <p>${isAi ? 'Alle Gruppen sind entschieden — stark!' : 'Namensbasiert nichts gefunden. Probier die KI-Suche für schlauere Gruppen (z.B. „Kaffeemaschine“ + „Espressomaschine“).'}</p></div>`;
      return;
    }
    const cards = await Promise.all(clusterArr.map(async (c, ci) => {
      const rows = await Promise.all(c.itemIds.map(async (id) => {
        const it = itemById[id];
        const thumb = await itemThumb(it);
        const h = houseOf(it);
        return `
          <div class="nav-row" data-cluster="${ci}" data-item="${id}">
            <a class="nav-row-ico" href="#/item/${id}" style="overflow:hidden;padding:0">${thumb}</a>
            <div class="grow">
              <div class="nav-row-title ellipsis">${esc(it.name || 'Ohne Namen')}</div>
              <div class="nav-row-sub">${h ? `${esc(h.icon)} ${esc(h.name)} · ` : ''}${esc(CONDITIONS[it.condition] || '')} · ${fmtEuro(it.value)}</div>
              <div class="mt-1">${statusChip(it.status, true)}</div>
            </div>
            <button class="btn btn-s" data-keep="${ci}:${id}">💚 Behalten</button>
          </div>`;
      }));
      return `
        <div class="card" data-cluster-card="${ci}">
          <div class="row-between">
            <div class="card-title" style="margin:0">${esc(c.title)}</div>
            <button class="icon-btn" data-dismiss="${ci}" title="Kein Duplikat" aria-label="Gruppe verwerfen">✕</button>
          </div>
          ${c.reason ? `<p class="small muted" style="margin:6px 0 10px">${esc(c.reason)}</p>` : '<div class="mb-1"></div>'}
          <div class="field" style="margin-bottom:10px"><label>Was passiert mit dem Rest der Gruppe?</label>
            <div class="segment" data-loser="${ci}">
              ${Object.entries(LOSER_ACTIONS).map(([k, a], i) =>
                `<button type="button" data-act="${k}" class="${i === 0 ? 'active' : ''}">${a.label}</button>`).join('')}
            </div>
          </div>
          <div class="stack">${rows.join('')}</div>
        </div>`;
    }));
    list.innerHTML = `<p class="small muted">${clusterArr.length} ${clusterArr.length === 1 ? 'Gruppe' : 'Gruppen'} ${isAi ? '(KI-Analyse)' : '(einfache Namens-Vorschau — die KI-Suche findet mehr)'}</p>` + cards.join('');

    // Verlierer-Aktion je Gruppe umschaltbar
    const loserByCluster = clusterArr.map(() => 'entsorgen');
    list.querySelectorAll('[data-loser]').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => b.onclick = () => {
        loserByCluster[Number(seg.dataset.loser)] = b.dataset.act;
        seg.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      });
    });

    // „Behalten“ → Gewinner behalten, Rest bekommt die gewählte Aktion
    list.querySelectorAll('[data-keep]').forEach((b) => b.onclick = async () => {
      const [ciStr, winnerId] = b.dataset.keep.split(':');
      const ci = Number(ciStr);
      const c = clusterArr[ci];
      const loserStatus = LOSER_ACTIONS[loserByCluster[ci]].status;
      const plan = await getMovePlan();
      const werkstoffhof = plan.destinations.find((d) => d.id === 'werkstoffhof');

      for (const id of c.itemIds) {
        const it = itemById[id];
        const isWinner = id === winnerId;
        await db.put('items', {
          ...it,
          status: isWinner ? 'behalten' : loserStatus,
          destination: !isWinner && loserStatus === 'entsorgen' && werkstoffhof ? werkstoffhof.id : it.destination,
          updatedAt: new Date().toISOString(),
        });
      }
      if (isAi && saved) {
        const idx = (saved.clusters || []).findIndex((x) => x.title === c.title && x.itemIds?.join() === c.itemIds.join());
        if (idx >= 0) { saved.clusters[idx].resolved = true; await setMeta('dupClusters', saved); }
      }
      toast(`Entschieden: „${itemById[winnerId].name}“ bleibt 💚`);
      renderDuplicates(container);
    });

    // Gruppe verwerfen (kein echtes Duplikat)
    list.querySelectorAll('[data-dismiss]').forEach((b) => b.onclick = async () => {
      const c = clusterArr[Number(b.dataset.dismiss)];
      if (isAi && saved) {
        const idx = (saved.clusters || []).findIndex((x) => x.title === c.title && x.itemIds?.join() === c.itemIds.join());
        if (idx >= 0) { saved.clusters[idx].resolved = true; await setMeta('dupClusters', saved); }
        renderDuplicates(container);
      } else {
        b.closest('[data-cluster-card]')?.remove();
      }
    });
  }

  await renderClusterCards(clusters.length ? clusters : heuristic, clusters.length > 0);

  container.querySelector('#dup-ai').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = '✨ Die KI vergleicht beide Haushalte …';
    try {
      const compact = items
        .filter((it) => !['entsorgen'].includes(it.status))
        .map((it) => ({
          id: it.id,
          name: it.name,
          category: it.category,
          house: houseOf(it)?.name || '?',
          condition: it.condition,
          value: it.value,
        }));
      if (compact.length < 2) throw new Error('Zu wenige Gegenstände für einen Vergleich.');
      const found = await clusterDuplicates(compact);
      const clean = found
        .map((c) => ({ title: c.title, reason: c.reason, itemIds: c.item_ids.filter((id) => itemById[id]), resolved: false }))
        .filter((c) => c.itemIds.length >= 2);
      await setMeta('dupClusters', { createdAt: new Date().toISOString(), clusters: clean });
      toast(clean.length ? `${clean.length} Dubletten-Gruppen gefunden 🔍` : 'Keine Dubletten gefunden — alles einzigartig! ✨');
      renderDuplicates(container);
    } catch (err) {
      toast(`⚠️ ${err.message}`, 4500);
      btn.disabled = false; btn.textContent = '✨ KI: Duplikate finden';
    }
  };
}

/* Einfache lokale Vorschau: gleiche Kategorie + Namens-Ähnlichkeit. */
function heuristicClusters(items) {
  const norm = (s) => (s || '').toLowerCase().replace(/["„“()]/g, '').split(/[\s\-,./]+/).filter((t) => t.length > 2);
  const groups = [];
  const used = new Set();
  for (let i = 0; i < items.length; i++) {
    if (used.has(items[i].id)) continue;
    const a = items[i];
    const ta = new Set(norm(a.name));
    const cluster = [a.id];
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      if (used.has(b.id) || b.category !== a.category) continue;
      const tb = norm(b.name);
      const overlap = tb.filter((t) => ta.has(t)).length;
      if (overlap >= 1 && (overlap / Math.max(ta.size, tb.length, 1)) >= 0.34) cluster.push(b.id);
    }
    if (cluster.length >= 2) {
      cluster.forEach((id) => used.add(id));
      const cat = CATEGORIES[a.category] || CATEGORIES.sonstiges;
      groups.push({ title: `${cat.icon} ${a.name}`, reason: '', itemIds: cluster });
    }
  }
  return groups;
}
