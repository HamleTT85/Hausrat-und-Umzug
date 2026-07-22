// Detailseite: Fotogalerie, alle Eigenschaften, Status, QR-Code, Verkauf.
import { db, uid, deleteItemDeep, getMeta } from '../db.js';
import { CATEGORIES, STATUSES, PRIORITIES, CONDITIONS, TRANSPORT, fmtEuro } from '../data.js';
import { esc, sheet, closeSheet, confirmSheet, toast, photoUrl, downscaleImage, catIcon } from '../ui.js';
import { qrImgTag, itemQrPayload } from '../qr.js';
import { suggestListing } from '../ai.js';

export async function renderItem(container, itemId) {
  const item = await db.get('items', itemId);
  if (!item) {
    container.innerHTML = '<div class="empty"><div class="empty-ico">🕳️</div><div class="empty-title">Gegenstand nicht gefunden</div></div>';
    return;
  }
  const room = await db.get('rooms', item.roomId);
  const floor = room ? await db.get('floors', room.floorId) : null;
  const house = room ? await db.get('houses', room.houseId) : null;

  const photoUrls = [];
  for (const pid of item.photoIds || []) {
    const u = await photoUrl(pid);
    if (u) photoUrls.push({ pid, url: u });
  }

  const locationText = [house?.name, floor?.name, room?.name].filter(Boolean).join(' › ');

  container.innerHTML = `
    <div class="crumbs">
      <a href="#/browse">Bestand</a>
      ${room ? `<span class="sep">›</span><a href="#/browse/${room.houseId}/${room.floorId}/${room.id}">${esc(room.name)}</a>` : ''}
    </div>

    <div class="gallery mb-2">
      ${photoUrls.map((p) => `<img src="${p.url}" alt="" data-photo="${p.pid}">`).join('')}
      <label class="gal-cell empty" style="width:130px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; background:var(--surface-2);">
        <span style="font-size:1.6rem">📷</span><span class="small muted">Foto</span>
        <input type="file" accept="image/*" capture="environment" id="add-photo" class="hidden">
      </label>
    </div>

    <form id="item-form" autocomplete="off">
      <div class="field"><label>Name</label>
        <input class="input" name="name" value="${esc(item.name)}" placeholder="z.B. Ecksofa"></div>

      <div class="field"><label>Status — was passiert damit?</label>
        <div class="chip-row" id="status-chips">
          ${Object.entries(STATUSES).map(([k, s]) =>
            `<button type="button" class="chip chip-select ${item.status === k ? 'selected' : ''}" data-status="${k}">${s.icon} ${s.label}</button>`).join('')}
        </div>
      </div>

      <div class="field"><label>Priorität</label>
        <div class="chip-row" id="prio-chips">
          ${Object.entries(PRIORITIES).map(([k, p]) =>
            `<button type="button" class="chip chip-select ${item.priority === k ? 'selected' : ''}" data-prio="${k}">${p.icon} ${p.label}</button>`).join('')}
        </div>
      </div>

      <div class="field-grid">
        <div class="field"><label>Kategorie</label>
          <select class="input" name="category">
            ${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}" ${item.category === k ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('')}
          </select></div>
        <div class="field"><label>Zustand</label>
          <select class="input" name="condition">
            ${Object.entries(CONDITIONS).map(([k, l]) => `<option value="${k}" ${item.condition === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
        <div class="field"><label>Alter (Jahre)</label>
          <input class="input" name="ageYears" type="number" min="0" value="${item.ageYears ?? ''}"></div>
        <div class="field"><label>Anzahl</label>
          <input class="input" name="quantity" type="number" min="1" value="${item.quantity ?? 1}"></div>
        <div class="field"><label>Material</label>
          <input class="input" name="material" value="${esc(item.material)}" placeholder="z.B. Eiche, Metall"></div>
        <div class="field"><label>Wert (€, geschätzt)</label>
          <input class="input" name="value" type="number" min="0" step="1" value="${item.value ?? ''}"></div>
      </div>

      <div class="field"><label>Transport-Status (Umzug)</label>
        <div class="segment" id="transport-seg">
          ${Object.entries(TRANSPORT).map(([k, t]) =>
            `<button type="button" data-transport="${k}" class="${item.transport === k ? 'active' : ''}">${t.icon} ${t.label}</button>`).join('')}
        </div>
      </div>

      <div class="field"><label>Notizen</label>
        <textarea class="input" name="notes" placeholder="Besonderheiten, Schäden, Erinnerungen …">${esc(item.notes)}</textarea></div>
    </form>

    ${item.status === 'verkaufen' ? `
    <div class="card mb-2">
      <div class="card-title">💰 Verkauf</div>
      <div class="field-grid">
        <div class="field"><label>Verkaufspreis (€)</label>
          <input class="input" id="sale-price" type="number" min="0" value="${item.sale?.price ?? ''}"></div>
      </div>
      <div class="field"><label>Anzeigentext</label>
        <textarea class="input" id="sale-desc" rows="5" placeholder="Noch leer — lass dir von der KI einen Vorschlag schreiben.">${esc(item.sale?.description || '')}</textarea></div>
      <button class="btn btn-block" id="ai-listing">✨ KI: Anzeige & Preis vorschlagen</button>
    </div>` : ''}

    <div class="card mb-2">
      <div class="card-title">🔖 QR-Etikett</div>
      <p class="small muted">Ausdrucken und auf den Karton oder das Möbelstück kleben — beim Scannen öffnet sich direkt dieser Eintrag.</p>
      <div class="qr-box">${qrImgTag(itemQrPayload(item.id))}
        <div class="small faint">${esc(item.name || '')} · ${esc(locationText)}</div>
      </div>
    </div>

    <div class="row mb-2">
      <button class="btn btn-danger" id="item-del">🗑️ Löschen</button>
      <button class="btn btn-primary grow" id="item-save">💾 Speichern</button>
    </div>
  `;

  /* ---- Interaktionen ---- */
  let status = item.status;
  let priority = item.priority;
  let transport = item.transport || 'offen';

  container.querySelectorAll('[data-status]').forEach((c) => c.onclick = () => {
    status = c.dataset.status;
    container.querySelectorAll('[data-status]').forEach((x) => x.classList.toggle('selected', x === c));
  });
  container.querySelectorAll('[data-prio]').forEach((c) => c.onclick = () => {
    priority = c.dataset.prio;
    container.querySelectorAll('[data-prio]').forEach((x) => x.classList.toggle('selected', x === c));
  });
  container.querySelectorAll('[data-transport]').forEach((c) => c.onclick = () => {
    transport = c.dataset.transport;
    container.querySelectorAll('[data-transport]').forEach((x) => x.classList.toggle('active', x === c));
  });

  async function save(silent = false) {
    const f = container.querySelector('#item-form');
    const upd = {
      ...item,
      name: f.name.value.trim(),
      category: f.category.value,
      condition: f.condition.value,
      ageYears: f.ageYears.value === '' ? null : Number(f.ageYears.value),
      quantity: Math.max(1, Number(f.quantity.value) || 1),
      material: f.material.value.trim(),
      value: f.value.value === '' ? null : Number(f.value.value),
      notes: f.notes.value.trim(),
      status, priority, transport,
      sale: {
        price: container.querySelector('#sale-price') ? numOrNull(container.querySelector('#sale-price').value) : item.sale?.price ?? null,
        description: container.querySelector('#sale-desc')?.value ?? item.sale?.description ?? '',
      },
      updatedAt: new Date().toISOString(),
    };
    await db.put('items', upd);
    if (!silent) toast('Gespeichert ✅');
    return upd;
  }

  container.querySelector('#item-save').onclick = async () => {
    const statusChanged = status !== item.status;
    await save();
    if (statusChanged) renderItem(container, itemId); // Verkaufsbox ein-/ausblenden
  };

  container.querySelector('#item-del').onclick = async () => {
    if (await confirmSheet('Gegenstand löschen?', `„${item.name}“ und alle Fotos werden entfernt.`)) {
      await deleteItemDeep(item.id);
      toast('Gelöscht');
      history.back();
    }
  };

  // Foto hinzufügen
  container.querySelector('#add-photo').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { blob } = await downscaleImage(file);
    const photo = { id: uid('ph'), itemId: item.id, blob, createdAt: new Date().toISOString() };
    await db.put('photos', photo);
    item.photoIds = [...(item.photoIds || []), photo.id];
    await db.put('items', { ...item, updatedAt: new Date().toISOString() });
    toast('Foto hinzugefügt 📷');
    renderItem(container, itemId);
  };

  // Foto-Optionen (löschen / als Titelbild)
  container.querySelectorAll('.gallery img[data-photo]').forEach((img) => {
    img.onclick = () => {
      const pid = img.dataset.photo;
      const box = sheet(`
        <h3>Foto</h3>
        <div class="stack">
          <button class="btn" id="p-cover">⭐ Als Titelbild verwenden</button>
          <button class="btn btn-danger" id="p-del">🗑️ Foto löschen</button>
        </div>`);
      box.querySelector('#p-cover').onclick = async () => {
        item.photoIds = [pid, ...item.photoIds.filter((x) => x !== pid)];
        await db.put('items', { ...item, updatedAt: new Date().toISOString() });
        closeSheet(); renderItem(container, itemId);
      };
      box.querySelector('#p-del').onclick = async () => {
        await db.del('photos', pid);
        item.photoIds = item.photoIds.filter((x) => x !== pid);
        await db.put('items', { ...item, updatedAt: new Date().toISOString() });
        closeSheet(); toast('Foto gelöscht'); renderItem(container, itemId);
      };
    };
  });

  // KI-Verkaufsanzeige
  container.querySelector('#ai-listing')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = '✨ Die KI schreibt …';
    try {
      const current = await save(true);
      let base64 = null;
      if (current.photoIds?.length) {
        const p = await db.get('photos', current.photoIds[0]);
        if (p?.blob) base64 = (await downscaleImage(p.blob, 1024)).base64;
      }
      const s = await suggestListing(current, base64);
      container.querySelector('#sale-desc').value = `${s.title}\n\n${s.description}`;
      container.querySelector('#sale-price').value = Math.round(s.price_eur);
      toast(`Vorschlag: ${fmtEuro(s.price_eur)} — ${s.price_note}`, 5000);
    } catch (err) {
      toast(`⚠️ ${err.message}`, 4500);
    } finally {
      btn.disabled = false; btn.textContent = '✨ KI: Anzeige & Preis vorschlagen';
    }
  });
}

function numOrNull(v) {
  return v === '' || v == null ? null : Number(v);
}
