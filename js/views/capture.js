// Erfassen: Foto aufnehmen → KI erkennt Gegenstände → auswählen & übernehmen.
import { db, uid } from '../db.js';
import { CATEGORIES, CONDITIONS, newItem, fmtEuro } from '../data.js';
import { esc, toast, downscaleImage } from '../ui.js';
import { analyzePhoto, getAiSettings, CAPTURE_MODES } from '../ai.js';

export async function renderCapture(container, query = '') {
  const params = new URLSearchParams(query || '');
  let roomId = params.get('room') || '';

  const rooms = await db.all('rooms');
  const houses = await db.all('houses');
  const floors = await db.all('floors');
  const { apiKey } = await getAiSettings();

  if (!rooms.length) {
    container.innerHTML = `
      <h1 class="page-title">📸 <em>Erfassen</em></h1>
      <div class="empty card"><div class="empty-ico">🚪</div>
        <div class="empty-title">Erst brauchst du einen Raum</div>
        <p>Lege unter „Bestand“ ein Zuhause mit Etage und Raum an — dann kann jedes Foto direkt richtig einsortiert werden.</p>
        <a class="btn btn-primary" href="#/browse">🏡 Zum Bestand</a>
      </div>`;
    return;
  }

  const roomLabel = (r) => {
    const h = houses.find((x) => x.id === r.houseId);
    const f = floors.find((x) => x.id === r.floorId);
    return `${h?.name || '?'} · ${f?.name || '?'} · ${r.name}`;
  };
  if (!roomId || !rooms.some((r) => r.id === roomId)) roomId = rooms[0].id;

  container.innerHTML = `
    <h1 class="page-title">📸 Raum <em>fotografieren</em></h1>
    <p class="page-sub">Ein Foto, und die KI erkennt Möbel, Zustand, Material und schätzt den Wert.</p>

    <div class="field"><label>In welchem Raum bist du?</label>
      <select class="input" id="cap-room">
        ${rooms.map((r) => `<option value="${r.id}" ${r.id === roomId ? 'selected' : ''}>${esc(r.icon)} ${esc(roomLabel(r))}</option>`).join('')}
      </select>
    </div>

    <div class="field"><label>Was soll erfasst werden?</label>
      <div class="segment" id="cap-mode">
        ${Object.entries(CAPTURE_MODES).map(([k, m]) =>
          `<button type="button" data-mode="${k}" class="${k === savedMode() ? 'active' : ''}">${m.label}</button>`).join('')}
      </div>
      <p class="small faint" id="cap-mode-hint" style="margin:4px 2px 0">${CAPTURE_MODES[savedMode()].hint}</p>
    </div>

    <div class="field"><label>Fokus für dieses Foto (optional)</label>
      <input class="input" id="cap-focus" placeholder="z.B. nur den Schreibtisch, Kabel und Technik ignorieren">
    </div>

    ${!apiKey ? `
      <div class="card mb-2">
        <div class="card-title">🔑 KI noch nicht verbunden</div>
        <p class="small muted">Ohne API-Key kannst du Fotos trotzdem speichern und Einträge manuell anlegen. Mit Key erledigt die KI die Erkennung automatisch.</p>
        <a class="btn btn-s" href="#/settings">Zu den Einstellungen</a>
      </div>` : ''}

    <label class="btn btn-primary btn-block" style="padding:16px">
      📷 Foto aufnehmen oder auswählen
      <input type="file" accept="image/*" capture="environment" id="cap-file" class="hidden">
    </label>

    <div id="cap-stage" class="mt-2"></div>
  `;

  const stage = container.querySelector('#cap-stage');
  container.querySelector('#cap-room').onchange = (e) => { roomId = e.target.value; };

  let mode = savedMode();
  container.querySelectorAll('#cap-mode button').forEach((b) => b.onclick = () => {
    mode = b.dataset.mode;
    sessionStorage.setItem('captureMode', mode);
    container.querySelectorAll('#cap-mode button').forEach((x) => x.classList.toggle('active', x === b));
    container.querySelector('#cap-mode-hint').textContent = CAPTURE_MODES[mode].hint;
  });

  container.querySelector('#cap-file').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { blob, dataUrl, base64 } = await downscaleImage(file);

    stage.innerHTML = `
      <div class="capture-preview mb-2"><img src="${dataUrl}" alt="Aufnahme"></div>
      <div class="ai-pulse" id="ai-wait">
        <div class="ai-pulse-ico">🔮</div>
        <div><b>Die KI schaut sich das Foto an …</b><br>
        <span class="small muted">Möbel erkennen, Zustand & Wert schätzen</span></div>
      </div>`;

    let found = [];
    let aiFailed = null;
    if (apiKey) {
      try {
        found = await analyzePhoto(base64, { mode, focus: container.querySelector('#cap-focus')?.value });
      } catch (err) {
        aiFailed = err.message;
      }
    } else {
      aiFailed = 'Kein API-Key hinterlegt — Eintrag bitte manuell ausfüllen.';
    }

    renderResults(stage, { blob, dataUrl, found, aiFailed, getRoomId: () => roomId });
  };
}

function renderResults(stage, { blob, dataUrl, found, aiFailed, getRoomId }) {
  const rows = found.map((f, i) => `
    <div class="card" data-idx="${i}">
      <div class="row-between">
        <label class="row grow" style="cursor:pointer">
          <input type="checkbox" checked data-check="${i}" style="width:20px;height:20px;accent-color:var(--accent)">
          <b class="grow">${(CATEGORIES[f.category] || CATEGORIES.sonstiges).icon} ${esc(f.name)}${f.quantity > 1 ? ` <span class="chip status-mini">×${f.quantity}</span>` : ''}</b>
        </label>
        <span class="chip chip-accent">${f.value_eur != null ? fmtEuro(f.value_eur) : '–'}</span>
      </div>
      <div class="small muted mt-1">
        ${esc(CONDITIONS[f.condition] || f.condition)} · ${f.age_years != null ? `ca. ${f.age_years} J.` : 'Alter unbekannt'}${f.material ? ` · ${esc(f.material)}` : ''}
      </div>
      ${f.notes ? `<div class="small faint mt-1">💬 ${esc(f.notes)}</div>` : ''}
    </div>`).join('');

  stage.innerHTML = `
    <div class="capture-preview mb-2"><img src="${dataUrl}" alt="Aufnahme"></div>
    ${aiFailed ? `<div class="card mb-2"><div class="card-title">⚠️ KI-Erkennung nicht möglich</div><p class="small muted">${esc(aiFailed)}</p></div>` : ''}
    ${found.length ? `
      <div class="card-title">✨ ${found.length} ${found.length === 1 ? 'Gegenstand' : 'Gegenstände'} erkannt — was übernehmen?</div>
      <div class="stack mb-2">${rows}</div>` : ''}
    <div class="stack">
      ${found.length ? `<button class="btn btn-primary btn-block" id="cap-adopt">✅ Auswahl übernehmen</button>` : ''}
      <button class="btn btn-block" id="cap-manual">✍️ ${found.length ? 'Stattdessen nur' : 'Nur'} 1 Eintrag mit diesem Foto anlegen</button>
    </div>`;

  stage.querySelector('#cap-adopt')?.addEventListener('click', async () => {
    const roomId = getRoomId();
    const selected = found.filter((_, i) => stage.querySelector(`[data-check="${i}"]`)?.checked);
    if (!selected.length) return toast('Nichts ausgewählt');

    const photo = { id: uid('ph'), itemId: null, blob, createdAt: new Date().toISOString() };
    await db.put('photos', photo);

    let firstId = null;
    for (const f of selected) {
      const it = newItem(roomId, {
        name: f.name,
        category: CATEGORIES[f.category] ? f.category : 'sonstiges',
        condition: CONDITIONS[f.condition] ? f.condition : 'gut',
        ageYears: f.age_years,
        material: f.material || '',
        value: f.value_eur,
        quantity: Math.max(1, f.quantity || 1),
        notes: f.notes || '',
        photoIds: [photo.id],
      });
      await db.put('items', it);
      firstId = firstId || it.id;
    }
    // Foto dem ersten Item zuordnen (für Aufräum-Logik)
    await db.put('photos', { ...photo, itemId: firstId });

    toast(`${selected.length} ${selected.length === 1 ? 'Gegenstand' : 'Gegenstände'} angelegt 🎉`);
    location.hash = selected.length === 1 ? `#/item/${firstId}` : roomHash(await db.get('rooms', roomId));
  });

  stage.querySelector('#cap-manual').onclick = async () => {
    const roomId = getRoomId();
    const photo = { id: uid('ph'), itemId: null, blob, createdAt: new Date().toISOString() };
    await db.put('photos', photo);
    const it = newItem(roomId, { name: '', photoIds: [photo.id] });
    await db.put('items', it);
    await db.put('photos', { ...photo, itemId: it.id });
    location.hash = `#/item/${it.id}`;
  };
}

function roomHash(room) {
  return room ? `#/browse/${room.houseId}/${room.floorId}/${room.id}` : '#/browse';
}

function savedMode() {
  const m = sessionStorage.getItem('captureMode');
  return CAPTURE_MODES[m] ? m : 'gross';
}
