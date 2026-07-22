// Bestand: hierarchische Navigation Haus → Etage → Raum → Gegenstände.
import { db, uid, deleteHouseDeep, deleteFloorDeep, deleteRoomDeep } from '../db.js';
import { HOUSE_ICONS, ROOM_ICONS, fmtEuro } from '../data.js';
import { esc, el, sheet, closeSheet, confirmSheet, toast, renderItemCard } from '../ui.js';

// path: '' | houseId | houseId/floorId | houseId/floorId/roomId
export async function renderBrowse(container, path = '') {
  const parts = (path || '').split('/').filter(Boolean);
  if (parts.length === 0) return listHouses(container);
  if (parts.length === 1) return listFloors(container, parts[0]);
  if (parts.length === 2) return listRooms(container, parts[0], parts[1]);
  return listRoomItems(container, parts[0], parts[1], parts[2]);
}

/* ---------------- Häuser ---------------- */
async function listHouses(container) {
  const houses = await db.all('houses');
  const floors = await db.all('floors');
  const rooms = await db.all('rooms');
  const items = await db.all('items');

  const rows = houses.map((h) => {
    const hFloors = floors.filter((f) => f.houseId === h.id);
    const hRooms = rooms.filter((r) => r.houseId === h.id);
    const hItems = items.filter((it) => hRooms.some((r) => r.id === it.roomId));
    return `
      <div class="nav-row card-link" data-id="${h.id}">
        <a class="row grow" style="gap:12px" href="#/browse/${h.id}">
          <div class="nav-row-ico">${esc(h.icon)}</div>
          <div class="grow">
            <div class="nav-row-title">${esc(h.name)}</div>
            <div class="nav-row-sub">${hFloors.length} Etagen · ${hRooms.length} Räume · ${hItems.length} Dinge</div>
          </div>
        </a>
        <button class="icon-btn" data-edit="${h.id}" aria-label="Bearbeiten">✏️</button>
        <span class="nav-row-chev">›</span>
      </div>`;
  }).join('');

  container.innerHTML = `
    <h1 class="page-title">Dein <em>Bestand</em></h1>
    <p class="page-sub">Haus → Etage → Raum → Gegenstand. So weißt du immer, wo etwas steht.</p>
    <div class="stack">${rows || ''}</div>
    ${!houses.length ? `<div class="empty"><div class="empty-ico">🏡</div><div class="empty-title">Noch kein Zuhause angelegt</div><p>Leg los — Wohnung, Haus, Keller, was du willst.</p></div>` : ''}
    <button class="btn btn-primary btn-block mt-2" id="add-house">＋ Haus / Wohnung hinzufügen</button>
  `;

  container.querySelector('#add-house').onclick = () => editHouseSheet(null, container);
  container.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = async (e) => {
      e.preventDefault();
      const h = await db.get('houses', b.dataset.edit);
      editHouseSheet(h, container);
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

function editFloorSheet(floor, houseId, container) {
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
    closeSheet(); listFloors(container, houseId);
  };
  box.querySelector('#f-del')?.addEventListener('click', async () => {
    closeSheet();
    if (await confirmSheet('Etage löschen?', `„${f.name}“ mit allen Räumen und Gegenständen löschen?`)) {
      await deleteFloorDeep(f.id); toast('Gelöscht'); listFloors(container, houseId);
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

function editRoomSheet(room, houseId, floorId, container) {
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
    closeSheet(); listRooms(container, houseId, floorId);
  };
  box.querySelector('#r-del')?.addEventListener('click', async () => {
    closeSheet();
    if (await confirmSheet('Raum löschen?', `„${r.name}“ mit allen Gegenständen löschen?`)) {
      await deleteRoomDeep(r.id); toast('Gelöscht'); listRooms(container, houseId, floorId);
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
  const cards = await Promise.all(items.map(renderItemCard));
  const val = items.reduce((s, it) => s + (Number(it.value) || 0), 0);

  container.innerHTML = `
    <div class="crumbs">
      <a href="#/browse">Bestand</a><span class="sep">›</span>
      <a href="#/browse/${houseId}">${esc(house?.name || '')}</a><span class="sep">›</span>
      <a href="#/browse/${houseId}/${floorId}">${esc(floor?.name || '')}</a><span class="sep">›</span>
      <span>${esc(room.name)}</span>
    </div>
    <div class="row-between">
      <h1 class="page-title mt-0">${esc(room.icon)} ${esc(room.name)}</h1>
    </div>
    <p class="page-sub">${items.length} Gegenstände · Wert ca. ${fmtEuro(val)}</p>
    <div class="row mb-2">
      <a class="btn btn-primary grow" href="#/capture?room=${roomId}">📸 Foto & KI-Erkennung</a>
      <button class="btn" id="add-manual">＋ Manuell</button>
    </div>
    ${cards.length
      ? `<div class="item-grid">${cards.join('')}</div>`
      : `<div class="empty"><div class="empty-ico">📸</div><div class="empty-title">Dieser Raum ist noch leer</div><p>Mach ein Foto — die KI erkennt Möbel & Co. automatisch.</p></div>`}
  `;

  container.querySelector('#add-manual').onclick = async () => {
    const { newItem } = await import('../data.js');
    const it = newItem(roomId, { name: 'Neuer Gegenstand' });
    await db.put('items', it);
    location.hash = `#/item/${it.id}`;
  };
}
