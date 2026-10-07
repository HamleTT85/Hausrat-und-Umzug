// Verkaufsliste: alle Gegenstände mit Status „verkaufen", inkl. KI-Hilfe & PDF.
import { db } from '../db.js';
import { fmtEuro } from '../data.js';
import { esc, itemThumb, toast } from '../ui.js';
import { generateSalesPdf } from '../pdf.js';
import { exportItemsPhotosZip } from '../zip.js';

export async function renderSell(container) {
  const items = (await db.all('items')).filter((it) => it.status === 'verkaufen');
  const rooms = await db.all('rooms');
  const roomById = Object.fromEntries(rooms.map((r) => [r.id, r]));
  const total = items.reduce((s, it) => s + ((Number(it.sale?.price ?? it.value) || 0) * (it.quantity || 1)), 0);

  const rows = await Promise.all(items.map(async (it) => {
    const thumb = await itemThumb(it);
    const price = it.sale?.price ?? it.value;
    const hasAd = !!it.sale?.description;
    return `
      <a class="nav-row card-link" href="#/item/${it.id}">
        <div class="nav-row-ico" style="overflow:hidden; padding:0">${thumb}</div>
        <div class="grow">
          <div class="nav-row-title ellipsis">${esc(it.name || 'Ohne Namen')}</div>
          <div class="nav-row-sub">${hasAd ? '📝 Anzeige fertig' : '✏️ Anzeige fehlt noch'}</div>
        </div>
        <span class="chip chip-warn nowrap">${fmtEuro(price)}</span>
        <span class="nav-row-chev">›</span>
      </a>`;
  }));

  container.innerHTML = `
    <div class="crumbs"><a href="#/move">Umzug</a><span class="sep">›</span><span>Verkaufen</span></div>
    <h1 class="page-title">💰 <em>Verkaufsliste</em></h1>
    <p class="page-sub">${items.length ? `${items.length} Gegenstände · zusammen ca. <b>${fmtEuro(total)}</b>` : 'Setze bei Gegenständen den Status auf „Verkaufen“, dann tauchen sie hier auf.'}</p>

    ${items.length ? `
      <div class="stack">${rows.join('')}</div>
      <div class="card mt-2">
        <div class="card-title">💡 Tipp</div>
        <p class="small muted" style="margin:0">Öffne einen Gegenstand und tippe auf <b>„✨ KI: Anzeige & Preis vorschlagen“</b> — du bekommst Titel, ehrlichen Anzeigentext und einen realistischen Preis für Kleinanzeigen & Co. Den Text kannst du dort direkt kopieren.</p>
      </div>
      <button class="btn btn-primary btn-block mt-2" id="make-pdf">📄 Als PDF (zum Verschicken)</button>
      <button class="btn btn-block mt-1" id="export-zip">📦 Alle Verkaufs-Fotos als ZIP</button>
      <button class="btn btn-block mt-1" id="copy-all">📋 Komplette Liste kopieren</button>
    ` : `
      <div class="empty"><div class="empty-ico">🏷️</div>
      <div class="empty-title">Noch nichts zu verkaufen</div>
      <p>Beim Ausmisten schlummert oft mehr Geld, als man denkt.</p>
      <a class="btn btn-primary" href="#/search">Bestand durchsehen</a></div>`}
  `;

  container.querySelector('#make-pdf')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = '📄 PDF wird erstellt …';
    try {
      const { blob, filename } = await generateSalesPdf(items, {
        title: 'Zu verkaufen',
        roomName: (it) => roomById[it.roomId]?.name || '',
      });
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Verkaufsliste' }); return; }
        catch { /* abgebrochen → Download */ }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 8000);
      toast('PDF erstellt ⬇️');
    } catch (err) {
      toast(`⚠️ ${err.message}`, 5000);
    } finally {
      btn.disabled = false; btn.textContent = label;
    }
  });

  container.querySelector('#export-zip')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = '📦 ZIP wird erstellt …';
    try {
      const zip = await exportItemsPhotosZip(db, items, (it) => roomById[it.roomId]?.name || '');
      const filename = `verkaufs-fotos-${new Date().toISOString().slice(0, 10)}.zip`;
      const file = new File([zip], filename, { type: 'application/zip' });
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Verkaufs-Fotos' }); return; }
        catch { /* abgebrochen → Download */ }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zip);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 8000);
      toast('ZIP erstellt ⬇️');
    } catch (err) {
      toast(`⚠️ ${err.message}`, 5000);
    } finally {
      btn.disabled = false; btn.textContent = label;
    }
  });

  container.querySelector('#copy-all')?.addEventListener('click', async () => {
    const lines = items.map((it) => {
      const price = it.sale?.price ?? it.value;
      return `• ${it.name} — ${fmtEuro(price)}${it.sale?.description ? `\n${it.sale.description}\n` : ''}`;
    });
    try {
      await navigator.clipboard.writeText(`Verkaufsliste (${new Date().toLocaleDateString('de-DE')})\n\n${lines.join('\n')}`);
      toast('Liste kopiert 📋');
    } catch {
      toast('Kopieren nicht möglich');
    }
  });
}
