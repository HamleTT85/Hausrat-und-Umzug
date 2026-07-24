// Bestand: hierarchische Navigation Haus → Etage → Raum → Gegenstände.
import { db, uid, deleteHouseDeep, deleteFloorDeep, deleteRoomDeep } from '../db.js';
import { HOUSE_ICONS, ROOM_ICONS, CATEGORIES, fmtEuro } from '../data.js';
import { esc, el, sheet, closeSheet, confirmSheet, toast, renderItemCard } from '../ui.js';

// path: '' | houseId | houseId/floorId | houseId/floorId/roomId
export async function renderBrowse(container, path = '') {
  const parts = (path || '').split('/').filter(Boolean);
  if (parts.length === 0) return listHouses(container);
  if (parts.length === 1) return listFloors(container, parts[0]);
  if (parts.length === 2) return listRooms(container, parts[0], parts[1]);
  return listRoomItems(container, parts[0], parts[1], parts[2]);
}

/* ---------------- Übersicht: alle Räume direkt anklickbar ---------------- */
async function listHouses(container) {
  const houses = await db.all('houses');
  const floors = await db.all('floors');
  const rooms = await db.all('rooms');
  const items = await db.all('items');

  const sections = houses.map((h) => {
    const hFloors = floors.filter((f) => f.houseId === h.id).sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
    const floorBlocks = hFloors.map((f) => {
      const fRooms = rooms.filter((r) => r.floorId === f.id);
      const tiles = fRooms.map((r) => {
        const n = items.filter((it) => it.roomId === r.id).length;
        return `
          <a class="room-tile" href="#/browse/${h.id}/${f.id}/${r.id}">
            <span class="room-tile-ico">${esc(r.icon)}</span>
            <span class="grow">
              <span class="room-tile-name">${esc(r.name)}</span>
              <span class="room-tile-sub">${n} ${n === 1 ? 'Ding' : 'Dinge'}</span>
            </span>
            <button class="room-tile-edit" data-edit-room="${r.id}" data-house="${h.id}" data-floor="${f.id}" aria-label="Raum bearbeiten">✏️</button>
          </a>`;
      }).join('');
      return `
        <div class="floor-block">
          <div class="floor-head">
            <span>🪜 ${esc(f.name)}</span>
            <span class="row" style="gap:4px">
              <button class="chip status-mini" data-edit-floor="${f.id}" data-house="${h.id}">✏️</button>
              <button class="chip status-mini" data-add-room="${f.id}" data-house="${h.id}">＋ Raum</button>
            </span>
          </div>
          ${fRooms.length ? `<div class="room-grid">${tiles}</div>` : '<p class="small faint" style="margin:4px 0 0">Noch kein Raum auf dieser Etage.</p>'}
        </div>`;
    }).join('');

    return `
      <div class="card mb-2">
        <div class="row-between">
          <div class="card-title" style="margin:0">${esc(h.icon)} ${esc(h.name)}</div>
          <span class="row" style="gap:6px">
            <button class="chip status-mini" data-add-floor="${h.id}">＋ Etage</button>
            <button class="icon-btn" data-edit="${h.id}" aria-label="Bearbeiten" style="width:34px;height:34px">✏️</button>
          </span>
        </div>
        ${floorBlocks || '<p class="small faint" style="margin:8px 0 0">Noch keine Etage — leg mit „＋ Etage“ los.</p>'}
      </div>`;
  }).join('');

  container.innerHTML = `
    <h1 class="page-title">Dein <em>Bestand</em></h1>
    <p class="page-sub">Tippe direkt auf einen Raum — da liegt alles drin.</p>
    ${sections}
    ${!houses.length ? `<div class="empty"><div class="empty-ico">🏡</div><div class="empty-title">Noch kein Zuhause angelegt</div><p>Leg los — Wohnung, Haus, Keller, was du willst.</p></div>` : ''}
    <button class="btn btn-primary btn-block mt-1" id="add-house">＋ Haus / Wohnung hinzufügen</button>
  `;

  container.querySelector('#add-house').onclick = () => editHouseSheet(null, container);
  container.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = async () => editHouseSheet(await db.get('houses', b.dataset.edit), container);
  });
  container.querySelectorAll('[data-add-floor]').forEach((b) => {
    b.onclick = () => editFloorSheet(null, b.dataset.addFloor, container, () => listHouses(container));
  });
  container.querySelectorAll('[data-edit-floor]').forEach((b) => {
    b.onclick = async () => editFloorSheet(await db.get('floors', b.dataset.editFloor), b.dataset.house, container, () => listHouses(container));
  });
  container.querySelectorAll('[data-add-room]').forEach((b) => {
    b.onclick = () => editRoomSheet(null, b.dataset.house, b.dataset.addRoom, container, () => listHouses(container));
  });
  container.querySelectorAll('[data-edit-room]').forEach((b) => {
    b.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation();
      editRoomSheet(await db.get('rooms', b.dataset.editRoom), b.dataset.house, b.dataset.floor, container, () => listHouses(container));
    };
  });
}

function editHouseSheet(house, container) {
  const isNew = !house;
  const h = house || { id: uid('house'), name: '', icon: '🏠' };
  const box = sheet(`
    <h3>${isNew ? 'Neues Zuhause' : 'Zuhause bearbeiten'}</h3>
    <div class="field"><label>Name</label>
      <input class="input" id="h-name" value="${esc(h.name)}" placeholder="z.B. Wohnung, Elternhaus"></div>
    <div class="field"><label>Symbol</label>
      <div class="chip-row" id="h-icons">${HOUSE_ICONS.map((i) => `<button class="chip chip-select ${i === h.icon ? 'selected' : ''}" data-i="${i}">${i}</button>`).join('')}</div></div>
    <div class="row mt-2">
      ${!isNew ? '<button class="btn btn-danger" id="h-del">🗑️</button>' : ''}
      <button class="btn grow" id="h-cancel">Abbrechen</button>
      <button class="btn btn-primary grow" id="h-save">Speichern</button>
    </div>`);
  let icon = h.icon;
  box.querySelectorAll('#h-icons .chip-select').forEach((c) => c.onclick = () => {
    icon = c.dataset.i;
    box.querySelectorAll('#h-icons .chip-select').forEach((x) => x.classList.toggle('selected', x === c));
  });
  box.querySelector('#h-cancel').onclick = closeSheet;
  box.querySelector('#h-save').onclick = async () => {
    const name = box.querySelector('#h-name').value.trim();
    if (!name) return toast('Bitte einen Namen eingeben');
    await db.put('houses', { ...h, name, icon });
    closeSheet(); toast(isNew ? 'Zuhause angelegt 🏡' : 'Gespeichert');
    listHouses(container);
  };
  box.querySelector('#h-del')?.addEventListener('click', async () => {
    closeSheet();
    if (await confirmSheet('Wirklich löschen?', `„${h.name}“ mit allen Etagen, Räumen und Gegenständen löschen?`)) {
      await deleteHouseDeep(h.id); toast('Gelöscht'); listHouses(container);
    }
  });
}

/* ---------------- Etagen ---------------- */
async function listFloors(container, houseId) {
  const house = await db.get('houses', houseId);
  if (!house) { location.hash = '#/browse'; return; }
  const floors = (await db.byIndex('floors', 'houseId', houseId)).sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
  const rooms = await db.byIndex('rooms', 'houseId', houseId);

  container.innerHTML = `
    <div class="crumbs"><a href="#/browse">Bestand</a><span class="sep">›</span><span>${esc(house.name)}</span></div>
    <h1 class="page-title">${esc(house.icon)} ${esc(house.name)}</h1>
    <div class="stack">
      ${floors.map((f) => {
        const n = rooms.filter((r) => r.floorId === f.id).length;
        return `
        <div class="nav-row card-link">
          <a class="row grow" style="gap:12px" href="#/browse/${houseId}/${f.id}">
            <div class="nav-row-ico">🪜</div>
            <div class="grow"><div class="nav-row-title">${esc(f.name)}</div>
            <div class="nav-row-sub">${n} ${n === 1 ? 'Raum' : 'Räume'}</div></div>
          </a>
          <button class="icon-btn" data-edit="${f.id}" aria-label="Bearbeiten">✏️</button>
          <span class="nav-row-chev">›</span>
        </div>`;
      }).join('')}
    </div>
    ${!floors.length ? `<div class="empty"><div class="empty-ico">🪜</div><div class="empty-title">Noch keine Etage</div><p>z.B. Erdgeschoss, 1. OG, Keller, Dachboden …</p></div>` : ''}
    <button class="btn btn-primary btn-block mt-2" id="add-floor">＋ Etage hinzufügen</button>
  `;

  container.querySelector('#add-floor').onclick = () => editFloorSheet(null, houseId, container);
  container.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = async () => editFloorSheet(await db.get('floors', b.dataset.edit), houseId, container);
  });
}

function editFloorSheet(floor, houseId, container, onDone = null) {
  const done = onDone || (() => listFloors(container, houseId));
  const isNew = !floor;
  const f = floor || { id: uid('floor'), houseId, name: '', level: 0 };
  const box = sheet(`
    <h3>${isNew ? 'Neue Etage' : 'Etage bearbeiten'}</h3>
    <div class="field"><label>Name</label>
      <input class="input" id="f-name" value="${esc(f.name)}" placeholder="z.B. Erdgeschoss, Keller"></div>
    <div class="field"><label>Ebene (für die Sortierung: Keller = -1, EG = 0, 1. OG = 1 …)</label>
      <input class="input" id="f-level" type="number" value="${f.level ?? 0}"></div>
    <div class="row mt-2">
      ${!isNew ? '<button class="btn btn-danger" id="f-del">🗑️</button>' : ''}
      <button class="btn grow" id="f-cancel">Abbrechen</button>
      <button class="btn btn-primary grow" id="f-save">Speichern</button>
    </div>`);
  box.querySelector('#f-cancel').onclick = closeSheet;
  box.querySelector('#f-save').onclick = async () => {
    const name = box.querySelector('#f-name').value.trim();
    if (!name) return toast('Bitte einen Namen eingeben');
    await db.put('floors', { ...f, name, level: Number(box.querySelector('#f-level').value) || 0 });
    closeSheet(); done();
  };
  box.querySelector('#f-del')?.addEventListener('click', async () => {
    closeSheet();
    if (await confirmSheet('Etage löschen?', `„${f.name}“ mit allen Räumen und Gegenständen löschen?`)) {
      await deleteFloorDeep(f.id); toast('Gelöscht'); done();
    }
  });
}

/* ---------------- Räume ---------------- */
async function listRooms(container, houseId, floorId) {
  const [house, floor] = await Promise.all([db.get('houses', houseId), db.get('floors', floorId)]);
  if (!house || !floor) { location.hash = '#/browse'; return; }
  const rooms = await db.byIndex('rooms', 'floorId', floorId);
  const items = await db.all('items');

  container.innerHTML = `
    <div class="crumbs">
      <a href="#/browse">Bestand</a><span class="sep">›</span>
      <a href="#/browse/${houseId}">${esc(house.name)}</a><span class="sep">›</span>
      <span>${esc(floor.name)}</span>
    </div>
    <h1 class="page-title">🪜 ${esc(floor.name)}</h1>
    <div class="stack">
      ${rooms.map((r) => {
        const rItems = items.filter((it) => it.roomId === r.id);
        const val = rItems.reduce((s, it) => s + (Number(it.value) || 0), 0);
        return `
        <div class="nav-row card-link">
          <a class="row grow" style="gap:12px" href="#/browse/${houseId}/${floorId}/${r.id}">
            <div class="nav-row-ico">${esc(r.icon)}</div>
            <div class="grow"><div class="nav-row-title">${esc(r.name)}</div>
            <div class="nav-row-sub">${rItems.length} Dinge · ${fmtEuro(val)}</div></div>
          </a>
          <button class="icon-btn" data-edit="${r.id}" aria-label="Bearbeiten">✏️</button>
          <span class="nav-row-chev">›</span>
        </div>`;
      }).join('')}
    </div>
    ${!rooms.length ? `<div class="empty"><div class="empty-ico">🚪</div><div class="empty-title">Noch kein Raum</div><p>z.B. Wohnzimmer, Küche, Bad …</p></div>` : ''}
    <button class="btn btn-primary btn-block mt-2" id="add-room">＋ Raum hinzufügen</button>
  `;

  container.querySelector('#add-room').onclick = () => editRoomSheet(null, houseId, floorId, container);
  container.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = async () => editRoomSheet(await db.get('rooms', b.dataset.edit), houseId, floorId, container);
  });
}

function editRoomSheet(room, houseId, floorId, container, onDone = null) {
  const done = onDone || (() => listRooms(container, houseId, floorId));
  const isNew = !room;
  const r = room || { id: uid('room'), houseId, floorId, name: '', icon: '🚪' };
  const box = sheet(`
    <h3>${isNew ? 'Neuer Raum' : 'Raum bearbeiten'}</h3>
    <div class="field"><label>Name</label>
      <input class="input" id="r-name" value="${esc(r.name)}" placeholder="z.B. Wohnzimmer"></div>
    <div class="field"><label>Symbol</label>
      <div class="chip-row" id="r-icons">${ROOM_ICONS.map((i) => `<button class="chip chip-select ${i === r.icon ? 'selected' : ''}" data-i="${i}">${i}</button>`).join('')}</div></div>
    <div class="row mt-2">
      ${!isNew ? '<button class="btn btn-danger" id="r-del">🗑️</button>' : ''}
      <button class="btn grow" id="r-cancel">Abbrechen</button>
      <button class="btn btn-primary grow" id="r-save">Speichern</button>
    </div>`);
  let icon = r.icon;
  box.querySelectorAll('#r-icons .chip-select').forEach((c) => c.onclick = () => {
    icon = c.dataset.i;
    box.querySelectorAll('#r-icons .chip-select').forEach((x) => x.classList.toggle('selected', x === c));
  });
  box.querySelector('#r-cancel').onclick = closeSheet;
  box.querySelector('#r-save').onclick = async () => {
    const name = box.querySelector('#r-name').value.trim();
    if (!name) return toast('Bitte einen Namen eingeben');
    await db.put('rooms', { ...r, name, icon });
    closeSheet(); done();
  };
  box.querySelector('#r-del')?.addEventListener('click', async () => {
    closeSheet();
    if (await confirmSheet('Raum löschen?', `„${r.name}“ mit allen Gegenständen löschen?`)) {
      await deleteRoomDeep(r.id); toast('Gelöscht'); done();
    }
  });
}

/* ---------------- Raum-Inhalt ---------------- */
async function listRoomItems(container, houseId, floorId, roomId) {
  const [house, floor, room] = await Promise.all([
    db.get('houses', houseId), db.get('floors', floorId), db.get('rooms', roomId),
  ]);
  if (!room) { location.hash = '#/browse'; return; }
  const items = await db.byIndex('items', 'roomId', roomId);
  const val = items.reduce((s, it) => s + (Number(it.value) || 0), 0);

  // Nach Kategorien gruppieren — übersichtlicher als eine lange Liste
  const groups = new Map();
  for (const it of items) {
    const key = CATEGORIES[it.category] ? it.category : 'sonstiges';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  const orderedGroups = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  const sections = await Promise.all(orderedGroups.map(async ([catKey, catItems]) => {
    const cat = CATEGORIES[catKey];
    const cards = await Promise.all(catItems.map(renderItemCard));
    const catVal = catItems.reduce((s, it) => s + (Number(it.value) || 0), 0);
    return `
      <div class="mb-2">
        <div class="row-between mb-1">
          <div class="card-title" style="margin:0">${cat.icon} ${cat.label} <span class="faint small">(${catItems.length})</span></div>
          <span class="small muted">${fmtEuro(catVal)}</span>
        </div>
        <div class="item-grid">${cards.join('')}</div>
      </div>`;
  }));

  container.innerHTML = `
    <div class="crumbs">
      <a href="#/browse">Bestand</a><span class="sep">›</span>
      <a href="#/browse">${esc(house?.name || '')}</a><span class="sep">›</span>
      <span>${esc(room.name)} <span class="faint">(${esc(floor?.name || '')})</span></span>
    </div>
    <div class="row-between">
      <h1 class="page-title mt-0">${esc(room.icon)} ${esc(room.name)}</h1>
    </div>
    <p class="page-sub">${items.length} Gegenstände · Wert ca. ${fmtEuro(val)}</p>
    <div class="row mb-2">
      <a class="btn btn-primary grow" href="#/capture?room=${roomId}">📸 Foto & KI-Erkennung</a>
      <button class="btn" id="add-manual">＋ Manuell</button>
    </div>
    ${sections.length
      ? sections.join('')
      : `<div class="empty"><div class="empty-ico">📸</div><div class="empty-title">Dieser Raum ist noch leer</div><p>Mach ein Foto — die KI erkennt Möbel & Co. automatisch.</p></div>`}
  `;

  container.querySelector('#add-manual').onclick = async () => {
    const { newItem } = await import('../data.js');
    const it = newItem(roomId, { name: 'Neuer Gegenstand' });
    await db.put('items', it);
    location.hash = `#/item/${it.id}`;
  };
}
