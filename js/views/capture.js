// Erfassen: Foto(s) aufnehmen oder hochladen → KI erkennt Gegenstände →
// auswählen & übernehmen. Unterstützt einzelne Fotos und ganze Bilderserien.
import { db, uid } from '../db.js';
import { CATEGORIES, CONDITIONS, newItem, fmtEuro } from '../data.js';
import { esc, toast, downscaleImage, blobToBase64 } from '../ui.js';
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
    <h1 class="page-title">📸 Raum <em>erfassen</em></h1>
    <p class="page-sub">Live fotografieren oder Bilder hochladen — auch eine ganze Serie. Die KI erkennt Möbel, Zustand, Material und schätzt den Wert.</p>

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

    <div class="field"><label>Fokus für diese Fotos (optional)</label>
      <input class="input" id="cap-focus" placeholder="z.B. nur den Schreibtisch, Kabel und Technik ignorieren">
    </div>

    ${!apiKey ? `
      <div class="card mb-2">
        <div class="card-title">🔑 KI noch nicht verbunden</div>
        <p class="small muted">Ohne API-Key kannst du Fotos trotzdem speichern und Einträge manuell anlegen. Mit Key erledigt die KI die Erkennung automatisch.</p>
        <a class="btn btn-s" href="#/settings">Zu den Einstellungen</a>
      </div>` : ''}

    <div class="row">
      <label class="btn btn-primary grow" style="padding:15px">
        📷 Kamera
        <input type="file" accept="image/*" capture="environment" id="cap-camera" class="hidden">
      </label>
      <label class="btn grow" style="padding:15px">
        🖼️ Galerie / Serie
        <input type="file" accept="image/*" multiple id="cap-gallery" class="hidden">
      </label>
    </div>

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

  const start = (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (files.length) processFiles(files);
  };
  container.querySelector('#cap-camera').onchange = start;
  container.querySelector('#cap-gallery').onchange = start;

  async function processFiles(files) {
    // 1. Alle Bilder verkleinern (Vorschau als Object-URL — spart viel Speicher)
    const shots = [];
    for (const file of files) {
      try {
        const { blob } = await downscaleImage(file);
        shots.push({ blob, url: URL.createObjectURL(blob) });
      } catch (err) {
        toast(`⚠️ Ein Bild konnte nicht gelesen werden${err?.message ? `: ${err.message}` : ''}`, 4000);
      }
    }
    if (!shots.length) return;

    // 2. Nacheinander analysieren, mit Fortschritt
    const focus = container.querySelector('#cap-focus')?.value;
    let aiFailed = null;
    for (let i = 0; i < shots.length; i++) {
      stage.innerHTML = `
        ${thumbStrip(shots, i)}
        <div class="ai-pulse">
          <div class="ai-pulse-ico">🔮</div>
          <div><b>${shots.length > 1 ? `Foto ${i + 1} von ${shots.length}` : 'Die KI schaut sich das Foto an'} …</b><br>
          <span class="small muted">Möbel erkennen, Zustand & Wert schätzen</span></div>
        </div>`;
      shots[i].found = [];
      if (apiKey && !aiFailed) {
        try {
          const base64 = await blobToBase64(shots[i].blob);
          shots[i].found = await analyzePhoto(base64, { mode, focus });
        } catch (err) {
          aiFailed = err.message; // z.B. Key ungültig → nicht für jedes Foto erneut probieren
        }
      }
    }
    if (!apiKey) aiFailed = 'Kein API-Key hinterlegt — Einträge bitte manuell anlegen.';

    renderResults(stage, { shots, aiFailed, getRoomId: () => roomId });
  }
}

function thumbStrip(shots, activeIdx = -1) {
  if (shots.length === 1) {
    return `<div class="capture-preview mb-2"><img src="${shots[0].url}" alt="Aufnahme"></div>`;
  }
  return `<div class="gallery mb-2">${shots.map((s, i) =>
    `<img src="${s.url}" alt="Foto ${i + 1}" style="height:110px;${i === activeIdx ? 'outline:3px solid var(--accent)' : ''}">`).join('')}</div>`;
}

function renderResults(stage, { shots, aiFailed, getRoomId }) {
  const totalFound = shots.reduce((s, sh) => s + (sh.found?.length || 0), 0);

  const sections = shots.map((sh, si) => {
    const rows = (sh.found || []).map((f, fi) => `
      <div class="card">
        <div class="row-between">
          <label class="row grow" style="cursor:pointer">
            <input type="checkbox" checked data-check="${si}:${fi}" style="width:20px;height:20px;accent-color:var(--accent)">
            <b class="grow">${(CATEGORIES[f.category] || CATEGORIES.sonstiges).icon} ${esc(f.name)}${f.quantity > 1 ? ` <span class="chip status-mini">×${f.quantity}</span>` : ''}</b>
          </label>
          <span class="chip chip-accent">${f.value_eur != null ? fmtEuro(f.value_eur) : '–'}</span>
        </div>
        <div class="small muted mt-1">
          ${esc(CONDITIONS[f.condition] || f.condition)} · ${f.age_years != null ? `ca. ${f.age_years} J.` : 'Alter unbekannt'}${f.material ? ` · ${esc(f.material)}` : ''}
        </div>
        ${f.notes ? `<div class="small faint mt-1">💬 ${esc(f.notes)}</div>` : ''}
      </div>`).join('');

    return `
      <div class="mb-2">
        ${shots.length > 1 ? `
          <div class="row mb-1" style="gap:10px">
            <img src="${sh.url}" alt="Foto ${si + 1}" style="width:64px;height:48px;object-fit:cover;border-radius:8px;border:1px solid var(--border)">
            <b>Foto ${si + 1}</b>
            <span class="small muted">${sh.found?.length || 0} erkannt</span>
          </div>` : ''}
        ${rows || (shots.length > 1 ? '<p class="small faint">Hier wurde nichts Passendes erkannt.</p>' : '')}
      </div>`;
  }).join('');

  stage.innerHTML = `
    ${shots.length === 1 ? thumbStrip(shots) : ''}
    ${aiFailed ? `<div class="card mb-2"><div class="card-title">⚠️ KI-Erkennung nicht möglich</div><p class="small muted">${esc(aiFailed)}</p></div>` : ''}
    ${totalFound ? `
      <div class="card-title">✨ ${totalFound} ${totalFound === 1 ? 'Gegenstand' : 'Gegenstände'} erkannt — was übernehmen?</div>` : ''}
    ${sections}
    <div class="stack">
      ${totalFound ? `<button class="btn btn-primary btn-block" id="cap-adopt">✅ Auswahl übernehmen</button>` : ''}
      ${shots.length === 1 ? `<button class="btn btn-block" id="cap-manual">✍️ ${totalFound ? 'Stattdessen nur' : 'Nur'} 1 Eintrag mit diesem Foto anlegen</button>` : ''}
    </div>`;

  const releaseShots = () => shots.forEach((sh) => sh.url && URL.revokeObjectURL(sh.url));

  stage.querySelector('#cap-adopt')?.addEventListener('click', async () => {
    const roomId = getRoomId();
    let created = 0, firstId = null;

    try {
      for (let si = 0; si < shots.length; si++) {
        const sh = shots[si];
        const selected = (sh.found || []).filter((_, fi) => stage.querySelector(`[data-check="${si}:${fi}"]`)?.checked);
        if (!selected.length) continue;

        const photo = { id: uid('ph'), itemId: null, blob: sh.blob, createdAt: new Date().toISOString() };
        await db.put('photos', photo);

        let photoOwner = null;
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
          created++;
          firstId = firstId || it.id;
          photoOwner = photoOwner || it.id;
        }
        await db.put('photos', { ...photo, itemId: photoOwner });
      }
    } catch (err) {
      return toast(`⚠️ Speichern fehlgeschlagen: ${err.message}`, 5000);
    }

    if (!created) return toast('Nichts ausgewählt');
    releaseShots();
    toast(`${created} ${created === 1 ? 'Gegenstand' : 'Gegenstände'} angelegt 🎉`);
    location.hash = created === 1 ? `#/item/${firstId}` : roomHash(await db.get('rooms', roomId));
  });

  stage.querySelector('#cap-manual')?.addEventListener('click', async () => {
    const roomId = getRoomId();
    try {
      const photo = { id: uid('ph'), itemId: null, blob: shots[0].blob, createdAt: new Date().toISOString() };
      await db.put('photos', photo);
      const it = newItem(roomId, { name: '', photoIds: [photo.id] });
      await db.put('items', it);
      await db.put('photos', { ...photo, itemId: it.id });
      releaseShots();
      location.hash = `#/item/${it.id}`;
    } catch (err) {
      toast(`⚠️ Speichern fehlgeschlagen: ${err.message}`, 5000);
    }
  });
}

function roomHash(room) {
  return room ? `#/browse/${room.houseId}/${room.floorId}/${room.id}` : '#/browse';
}

function savedMode() {
  const m = sessionStorage.getItem('captureMode');
  return CAPTURE_MODES[m] ? m : 'gross';
}
