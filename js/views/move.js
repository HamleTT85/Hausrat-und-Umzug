// Umzugsplaner: Termin, Adressen, Helfer, Fahrzeuge, Transport-Fortschritt.
import { db, uid, setMeta } from '../db.js';
import { TRANSPORT, getMovePlan } from '../data.js';
import { esc, sheet, closeSheet, toast, statusChip, confirmSheet } from '../ui.js';

export async function renderMove(container) {
  const plan = await getMovePlan();
  const items = await db.all('items');

  const moving = items.filter((it) => ['umziehen', 'einlagern', 'behalten'].includes(it.status));
  const counts = {};
  for (const it of moving) counts[it.transport || 'offen'] = (counts[it.transport || 'offen'] || 0) + 1;
  const done = (counts.angekommen || 0) + (counts.ausgepackt || 0);
  const pct = moving.length ? Math.round((done / moving.length) * 100) : 0;

  const todoNow = items.filter((it) => it.priority === 'sofort' && it.status !== 'behalten');
  const daysLeft = plan.date ? Math.ceil((new Date(plan.date) - new Date()) / 86400000) : null;

  container.innerHTML = `
    <h1 class="page-title">🚚 Dein <em>Umzug</em></h1>
    <p class="page-sub">Alles auf einen Blick: Termin, Team, Transport-Fortschritt.</p>

    <div class="card mb-2">
      <div class="row-between">
        <div class="card-title mt-0" style="margin-bottom:0">📅 Umzugstag</div>
        ${daysLeft != null && daysLeft >= 0 ? `<span class="chip chip-accent">${daysLeft === 0 ? 'Heute!' : `noch ${daysLeft} Tage`}</span>` : ''}
      </div>
      <div class="field mt-1"><input class="input" id="mv-date" type="date" value="${esc(plan.date)}"></div>
      <div class="field"><label>Von</label><input class="input" id="mv-from" value="${esc(plan.fromAddress)}" placeholder="Alte Adresse"></div>
      <div class="field"><label>Nach</label><input class="input" id="mv-to" value="${esc(plan.toAddress)}" placeholder="Neue Adresse"></div>
      <div class="field"><label>Notizen</label><textarea class="input" id="mv-notes" rows="2" placeholder="Halteverbot, Schlüsselübergabe …">${esc(plan.notes)}</textarea></div>
      <button class="btn btn-primary btn-block" id="mv-save">💾 Plan speichern</button>
    </div>

    <div class="card mb-2">
      <div class="card-title">🧭 Fahrten & Ziele</div>
      <p class="small muted">Jede Fahrt ist eine Ladeliste: Weise Gegenständen auf ihrer Detailseite ein Ziel zu — hier siehst du, was auf welche Fahrt muss.</p>
      <div class="stack">
        ${plan.destinations.map((d) => {
          const dItems = items.filter((it) => it.destination === d.id);
          const packed = dItems.filter((it) => ['verpackt', 'verladen', 'angekommen', 'ausgepackt'].includes(it.transport)).length;
          return `
          <div class="nav-row card-link" data-dest-open="${esc(d.id)}" style="cursor:pointer">
            <div class="nav-row-ico">${esc(d.icon)}</div>
            <div class="grow">
              <div class="nav-row-title">${esc(d.name)}</div>
              <div class="nav-row-sub">${dItems.length} ${dItems.length === 1 ? 'Gegenstand' : 'Gegenstände'}${dItems.length ? ` · ${packed} verpackt+` : ''}</div>
            </div>
            <button class="icon-btn" data-dest-del="${esc(d.id)}" aria-label="Fahrt entfernen">✕</button>
            <span class="nav-row-chev">›</span>
          </div>`;
        }).join('')}
      </div>
      <div class="row mt-1">
        <button class="btn btn-s" id="add-dest">＋ Fahrt / Ziel</button>
        <span class="small faint grow">Nicht zugewiesen: ${items.filter((it) => !it.destination).length}</span>
      </div>
    </div>

    <a class="card card-link mb-2" href="#/duplicates">
      <div class="row-between">
        <div><div class="card-title" style="margin:0">👯 Doppelte Dinge klären</div>
        <div class="small muted">Zwei Haushalte, zwei Kaffeemaschinen? Die KI gruppiert Dubletten — du entscheidest, was bleibt.</div></div>
        <span class="nav-row-chev">›</span>
      </div>
    </a>

    <div class="card mb-2">
      <div class="card-title">📦 Transport-Fortschritt</div>
      ${moving.length ? `
        <div class="row-between small muted mb-1"><span>${done} von ${moving.length} angekommen</span><b>${pct}%</b></div>
        <div class="progressbar mb-2"><div style="width:${pct}%"></div></div>
        <div class="chip-row">
          ${Object.entries(TRANSPORT).map(([k, t]) => `<span class="chip">${t.icon} ${t.label}: <b>${counts[k] || 0}</b></span>`).join('')}
        </div>
        <p class="small faint mt-1">Den Transport-Status setzt du direkt auf der Detailseite jedes Gegenstands — z.B. beim Verpacken per QR-Scan.</p>
      ` : `<p class="small muted">Sobald Gegenstände auf „Umziehen“, „Einlagern“ oder „Behalten“ stehen, siehst du hier den Fortschritt.</p>`}
    </div>

    ${todoNow.length ? `
    <div class="card mb-2">
      <div class="card-title">🔥 Sofort erledigen (${todoNow.length})</div>
      <div class="stack">
        ${todoNow.slice(0, 6).map((it) => `
          <a class="row-between" href="#/item/${it.id}">
            <span class="ellipsis grow">${esc(it.name)}</span>${statusChip(it.status, true)}
          </a>`).join('')}
      </div>
    </div>` : ''}

    <div class="card mb-2">
      <div class="card-title">💪 Helfer:innen</div>
      <div class="stack" id="helper-list">
        ${plan.helpers.map((h) => `
          <div class="row-between">
            <div class="grow"><b>${esc(h.name)}</b>${h.note ? ` <span class="small muted">· ${esc(h.note)}</span>` : ''}</div>
            <button class="icon-btn" data-del-helper="${h.id}" aria-label="Entfernen">✕</button>
          </div>`).join('') || '<p class="small muted">Noch niemand eingetragen. Pizza nicht vergessen! 🍕</p>'}
      </div>
      <button class="btn btn-s mt-1" id="add-helper">＋ Helfer:in</button>
    </div>

    <div class="card mb-2">
      <div class="card-title">🚐 Fahrzeuge</div>
      <div class="stack">
        ${plan.vehicles.map((v) => `
          <div class="row-between">
            <div class="grow"><b>${esc(v.name)}</b>${v.note ? ` <span class="small muted">· ${esc(v.note)}</span>` : ''}</div>
            <button class="icon-btn" data-del-vehicle="${v.id}" aria-label="Entfernen">✕</button>
          </div>`).join('') || '<p class="small muted">Noch kein Fahrzeug geplant.</p>'}
      </div>
      <button class="btn btn-s mt-1" id="add-vehicle">＋ Fahrzeug</button>
    </div>

    <a class="card card-link mb-2" href="#/sell">
      <div class="row-between">
        <div><div class="card-title" style="margin:0">💰 Verkaufsliste</div>
        <div class="small muted">Alles, was vor dem Umzug noch Geld bringen soll.</div></div>
        <span class="nav-row-chev">›</span>
      </div>
    </a>
  `;

  async function savePlan(p) {
    await setMeta('movePlan', p);
  }

  container.querySelector('#mv-save').onclick = async () => {
    plan.date = container.querySelector('#mv-date').value;
    plan.fromAddress = container.querySelector('#mv-from').value.trim();
    plan.toAddress = container.querySelector('#mv-to').value.trim();
    plan.notes = container.querySelector('#mv-notes').value.trim();
    await savePlan(plan);
    toast('Umzugsplan gespeichert ✅');
    renderMove(container);
  };

  container.querySelector('#add-helper').onclick = () => personSheet('Helfer:in', async (name, note) => {
    plan.helpers.push({ id: uid('h'), name, note });
    await savePlan(plan); renderMove(container);
  });
  container.querySelector('#add-vehicle').onclick = () => personSheet('Fahrzeug', async (name, note) => {
    plan.vehicles.push({ id: uid('v'), name, note });
    await savePlan(plan); renderMove(container);
  });

  container.querySelectorAll('[data-del-helper]').forEach((b) => b.onclick = async () => {
    plan.helpers = plan.helpers.filter((h) => h.id !== b.dataset.delHelper);
    await savePlan(plan); renderMove(container);
  });
  container.querySelectorAll('[data-del-vehicle]').forEach((b) => b.onclick = async () => {
    plan.vehicles = plan.vehicles.filter((v) => v.id !== b.dataset.delVehicle);
    await savePlan(plan); renderMove(container);
  });

  /* ---- Fahrten / Ziele ---- */
  container.querySelectorAll('[data-dest-open]').forEach((rowEl) => {
    rowEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-dest-del]')) return;
      const d = plan.destinations.find((x) => x.id === rowEl.dataset.destOpen);
      const dItems = items.filter((it) => it.destination === d.id);
      sheet(`
        <h3>${esc(d.icon)} ${esc(d.name)} — Ladeliste</h3>
        ${dItems.length ? `<div class="stack">
          ${dItems.map((it) => `
            <a class="row-between" href="#/item/${it.id}">
              <span class="ellipsis grow">${TRANSPORT[it.transport || 'offen'].icon} ${esc(it.name || 'Ohne Namen')}</span>
              ${statusChip(it.status, true)}
            </a>`).join('')}
        </div>` : '<p class="small muted">Noch nichts zugewiesen. Öffne einen Gegenstand und wähle unter „Ziel / Fahrt“ diese Fahrt aus.</p>'}
      `);
    });
  });

  container.querySelectorAll('[data-dest-del]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    const d = plan.destinations.find((x) => x.id === b.dataset.destDel);
    const affected = items.filter((it) => it.destination === d.id);
    if (!(await confirmSheet('Fahrt entfernen?', affected.length
      ? `„${d.name}“ entfernen? ${affected.length} zugewiesene Gegenstände werden wieder auf „Offen“ gesetzt.`
      : `„${d.name}“ entfernen?`, 'Entfernen'))) return;
    for (const it of affected) await db.put('items', { ...it, destination: '' });
    plan.destinations = plan.destinations.filter((x) => x.id !== d.id);
    await savePlan(plan); renderMove(container);
  });

  container.querySelector('#add-dest').onclick = () => {
    const box = sheet(`
      <h3>Neue Fahrt / neues Ziel</h3>
      <div class="field"><label>Name</label>
        <input class="input" id="d-name" placeholder="z.B. Fahrt zum Sperrmüll, Kiste zu Oma"></div>
      <div class="field"><label>Symbol</label>
        <div class="chip-row" id="d-icons">
          ${['🚗','🚚','♻️','🏡','🏠','📦','🗑️','🎁','🚐'].map((i, idx) =>
            `<button class="chip chip-select ${idx === 0 ? 'selected' : ''}" data-i="${i}">${i}</button>`).join('')}
        </div></div>
      <div class="row mt-2">
        <button class="btn grow" id="d-cancel">Abbrechen</button>
        <button class="btn btn-primary grow" id="d-save">Anlegen</button>
      </div>`);
    let icon = '🚗';
    box.querySelectorAll('#d-icons .chip-select').forEach((c) => c.onclick = () => {
      icon = c.dataset.i;
      box.querySelectorAll('#d-icons .chip-select').forEach((x) => x.classList.toggle('selected', x === c));
    });
    box.querySelector('#d-cancel').onclick = closeSheet;
    box.querySelector('#d-save').onclick = async () => {
      const name = box.querySelector('#d-name').value.trim();
      if (!name) return toast('Bitte einen Namen eingeben');
      plan.destinations.push({ id: uid('dest'), icon, name });
      await savePlan(plan); closeSheet(); renderMove(container);
    };
    box.querySelector('#d-name').focus();
  };
}

function personSheet(kind, onSave) {
  const box = sheet(`
    <h3>${esc(kind)} hinzufügen</h3>
    <div class="field"><label>Name</label><input class="input" id="p-name" placeholder="${kind === 'Fahrzeug' ? 'z.B. Sprinter (Miete)' : 'z.B. Lena'}"></div>
    <div class="field"><label>Notiz</label><input class="input" id="p-note" placeholder="${kind === 'Fahrzeug' ? 'z.B. 3,5t · 8–18 Uhr gebucht' : 'z.B. hat Werkzeug, nur vormittags'}"></div>
    <div class="row mt-2">
      <button class="btn grow" id="p-cancel">Abbrechen</button>
      <button class="btn btn-primary grow" id="p-save">Hinzufügen</button>
    </div>`);
  box.querySelector('#p-cancel').onclick = closeSheet;
  box.querySelector('#p-save').onclick = () => {
    const name = box.querySelector('#p-name').value.trim();
    if (!name) return toast('Bitte einen Namen eingeben');
    const note = box.querySelector('#p-note').value.trim();
    closeSheet(); onSave(name, note);
  };
  box.querySelector('#p-name').focus();
}
