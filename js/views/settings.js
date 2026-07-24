// Einstellungen: KI-Zugang, Datensicherung, Demo-Daten.
import { db, getMeta, setMeta, exportAll, importAll } from '../db.js';
import { loadDemoData } from '../data.js';
import { esc, toast, confirmSheet } from '../ui.js';
import { DEFAULT_MODEL } from '../ai.js';

const MODELS = [
  { id: 'claude-opus-4-8',  label: 'Claude Opus 4.8 — beste Erkennung (Standard)' },
  { id: 'claude-sonnet-5',  label: 'Claude Sonnet 5 — schnell & günstiger' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — am günstigsten' },
];

export async function renderSettings(container) {
  const apiKey = await getMeta('apiKey', '');
  const model = await getMeta('model', DEFAULT_MODEL);
  const itemCount = (await db.all('items')).length;

  container.innerHTML = `
    <h1 class="page-title">⚙️ <em>Einstellungen</em></h1>

    <div class="card mb-2">
      <div class="card-title">🤖 KI-Erkennung (Claude)</div>
      <p class="small muted">Die Bilderkennung nutzt die Claude-API von Anthropic. Dein Key wird <b>nur lokal auf diesem Gerät</b> gespeichert und Fotos werden nur zur Analyse an die API geschickt. Key erstellen: <span class="nowrap">platform.claude.com</span></p>
      <div class="field"><label>API-Key</label>
        <input class="input" id="set-key" type="password" value="${esc(apiKey)}" placeholder="sk-ant-…"></div>
      <div class="field"><label>Modell</label>
        <select class="input" id="set-model">
          ${MODELS.map((m) => `<option value="${m.id}" ${m.id === model ? 'selected' : ''}>${m.label}</option>`).join('')}
        </select></div>
      <button class="btn btn-primary btn-block" id="save-ai">💾 Speichern</button>
    </div>

    <div class="card mb-2">
      <div class="card-title">💾 Datensicherung</div>
      <p class="small muted">Alle Daten (inkl. Fotos) liegen lokal im Browser. Sichere sie regelmäßig als Datei — z.B. vor einem Gerätewechsel.</p>
      <div class="stack">
        <button class="btn" id="do-export">⬇️ Sicherung exportieren</button>
        <label class="btn">⬆️ Sicherung importieren
          <input type="file" accept="application/json" id="do-import" class="hidden">
        </label>
      </div>
    </div>

    <div class="card mb-2">
      <div class="card-title">🏡 Unser Zuhause anlegen</div>
      <p class="small muted">Legt eure komplette Raumstruktur leer an: <b>Wohnung</b> (Wohnzimmer, Garderobe, Kinderzimmer, Schlafzimmer, Studio, 2 Bäder) und <b>Haus nebenan</b> (EG, Obergeschoss mit Galerie, Keller, Dachboden). Danach nur noch durchfotografieren.</p>
      <button class="btn btn-primary" id="do-family">🏡 Unsere Räume anlegen</button>
    </div>

    <div class="card mb-2">
      <div class="card-title">🧪 Ausprobieren</div>
      <p class="small muted">Beispieldaten mit zwei Häusern, Räumen und Gegenständen laden — ideal zum Kennenlernen.</p>
      <button class="btn" id="do-demo">Beispieldaten laden</button>
    </div>

    <div class="card mb-2">
      <div class="card-title">📊 Speicher</div>
      <p class="small muted" id="storage-info">Wird ermittelt …</p>
    </div>

    <div class="card mb-2">
      <div class="card-title">🧨 Gefahrenzone</div>
      <p class="small muted">Aktuell ${itemCount} Gegenstände gespeichert.</p>
      <button class="btn btn-danger" id="do-wipe">Alle Daten löschen</button>
    </div>

    <p class="tc small faint">HausRat · läuft komplett lokal in deinem Browser · v1.0</p>
  `;

  // Speicher-Nutzung anzeigen (App-Daten im Browser, nicht der Handy-Speicher)
  (async () => {
    const info = container.querySelector('#storage-info');
    try {
      const est = await navigator.storage?.estimate?.();
      const persisted = await navigator.storage?.persisted?.();
      if (est?.quota) {
        const used = (est.usage / 1048576).toFixed(1);
        const quota = Math.round(est.quota / 1048576);
        info.textContent = `${used} MB von ca. ${quota.toLocaleString('de-DE')} MB belegt (App-Speicher im Browser)${persisted ? ' · dauerhaft geschützt ✅' : ''}`;
      } else {
        info.textContent = 'Keine Angabe von diesem Browser verfügbar.';
      }
    } catch {
      info.textContent = 'Keine Angabe von diesem Browser verfügbar.';
    }
  })();

  container.querySelector('#save-ai').onclick = async () => {
    await setMeta('apiKey', container.querySelector('#set-key').value.trim());
    await setMeta('model', container.querySelector('#set-model').value);
    toast('KI-Einstellungen gespeichert ✅');
  };

  container.querySelector('#do-export').onclick = async () => {
    toast('Sicherung wird erstellt …');
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hausrat-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  container.querySelector('#do-import').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!(await confirmSheet('Sicherung importieren?', 'Der aktuelle Bestand wird dabei ersetzt.', 'Importieren'))) return;
    try {
      const data = JSON.parse(await file.text());
      await importAll(data);
      toast('Sicherung wiederhergestellt 🎉');
      location.hash = '#/';
    } catch (err) {
      toast(`⚠️ ${err.message}`, 4000);
    }
  };

  container.querySelector('#do-family').onclick = async () => {
    const houses = await db.all('houses');
    if (houses.some((h) => ['Wohnung', 'Haus nebenan'].includes(h.name))) {
      if (!(await confirmSheet('Nochmal anlegen?', '„Wohnung“ oder „Haus nebenan“ existieren schon — die Struktur würde doppelt angelegt.', 'Trotzdem anlegen'))) return;
    }
    const { loadFamilyStructure } = await import('../data.js');
    await loadFamilyStructure();
    toast('Eure Räume sind angelegt 🏡 Jetzt durchfotografieren!');
    location.hash = '#/browse';
  };

  container.querySelector('#do-demo').onclick = async () => {
    if (itemCount > 0 && !(await confirmSheet('Beispieldaten laden?', 'Sie werden zu deinem bestehenden Bestand hinzugefügt.', 'Laden'))) return;
    await loadDemoData();
    toast('Beispieldaten geladen 🧪');
    location.hash = '#/';
  };

  container.querySelector('#do-wipe').onclick = async () => {
    if (!(await confirmSheet('Wirklich ALLES löschen?', 'Alle Häuser, Räume, Gegenstände und Fotos werden unwiderruflich entfernt. Einstellungen bleiben nicht erhalten.'))) return;
    await db.clearAll();
    toast('Alles gelöscht');
    location.hash = '#/';
  };
}
