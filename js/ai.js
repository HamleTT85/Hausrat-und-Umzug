// KI-Anbindung: Claude Vision analysiert Fotos und liefert strukturierte
// Inventar-Einträge. Läuft direkt im Browser (kein Server nötig) —
// der API-Key bleibt lokal in IndexedDB auf diesem Gerät.
import { getMeta } from './db.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
export const DEFAULT_MODEL = 'claude-opus-4-8';

const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name:       { type: 'string', description: 'Kurzer, prägnanter Name des Gegenstands auf Deutsch' },
          category:   { type: 'string', enum: ['sofa_sessel','tische','stuehle','schraenke','betten','lampen','elektro','kueche','deko','textilien','buecher_medien','werkzeug','sport_freizeit','spielzeug','sonstiges'] },
          condition:  { type: 'string', enum: ['neuwertig','sehr_gut','gut','gebraucht','abgenutzt','defekt'] },
          age_years:  { type: ['integer','null'], description: 'Geschätztes Alter in Jahren, null wenn nicht einschätzbar' },
          material:   { type: 'string', description: 'Hauptmaterialien, z.B. "Eiche massiv, Metall"' },
          value_eur:  { type: ['number','null'], description: 'Realistischer Wiederverkaufswert gebraucht in Euro' },
          quantity:   { type: 'integer', description: 'Anzahl gleichartiger Stücke im Bild' },
          notes:      { type: 'string', description: 'Auffälligkeiten: Schäden, Besonderheiten, Marke falls erkennbar' },
        },
        required: ['name','category','condition','age_years','material','value_eur','quantity','notes'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

export async function getAiSettings() {
  return {
    apiKey: await getMeta('apiKey', ''),
    model: await getMeta('model', DEFAULT_MODEL),
  };
}

async function callClaude(body, apiKey) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `API-Fehler (${res.status})`;
    try { msg = (await res.json())?.error?.message || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const data = await res.json();
  if (data.stop_reason === 'refusal') {
    throw new Error('Die KI hat die Anfrage abgelehnt. Bitte anderes Foto probieren.');
  }
  return data;
}

function firstText(data) {
  const block = (data.content || []).find((b) => b.type === 'text');
  return block ? block.text : '';
}

// Erfassungs-Modi: steuern, wie granular die KI das Foto auswertet.
export const CAPTURE_MODES = {
  gross: {
    label: '🛋️ Nur große Sachen',
    hint: 'Möbel & Großgeräte — Kabel, Deko-Kleinkram und Technik-Zubehör werden ignoriert. Ideal für Wohnräume und Studio.',
    prompt: `Erfasse AUSSCHLIESSLICH große Einrichtungsgegenstände: Möbel (Tische, Schränke,
Sofas, Betten, Regale, Stühle), Großgeräte, große Lampen und Teppiche.
IGNORIERE konsequent: Kabel, Technik-Zubehör, Deko-Kleinteile, Geschirr, Bücher,
Pflanzen und alles, was kleiner als ein Nachttisch ist. Lieber zu wenig als zu viel erfassen.`,
  },
  alles: {
    label: '📦 Alles Relevante',
    hint: 'Möbel, Geräte und größere Haushaltsgegenstände — der Allrounder.',
    prompt: `Erkenne alle relevanten Einrichtungsgegenstände, Möbel und Geräte
(keine Kleinteile wie einzelne Stifte oder Lebensmittel).`,
  },
  detail: {
    label: '🍽️ Küchen-Detail',
    hint: 'Auch Kleineres, sinnvoll gebündelt: „Teller-Set (8 Stk.)“, „Besteck-Set“, „Töpfe (5 Stk.)“. Ideal zum Abgleich doppelter Küchen.',
    prompt: `Erfasse auch kleinere Haushaltsgegenstände, aber bündle Gleichartiges zu sinnvollen
Gruppen mit Stückzahl statt Einzelteilen — z.B. "Teller-Set (8 Stk.)", "Besteck-Set",
"Töpfe und Pfannen (5 Stk.)", "Gläser (12 Stk.)". Typischer Einsatz: Küchenschränke,
Geschirr, Vorratsbehälter. Einzelne Verbrauchsartikel und Lebensmittel ignorieren.`,
  },
};

/**
 * Analysiert ein Raumfoto und erkennt Einrichtungsgegenstände.
 * @param {string} base64Jpeg  Bilddaten (JPEG, ohne data:-Präfix)
 * @param {{mode?: string, focus?: string}} opts  Erfassungs-Modus + freie Fokus-Anweisung
 * @returns {Promise<Array>} erkannte Gegenstände
 */
export async function analyzePhoto(base64Jpeg, opts = {}) {
  const { apiKey, model } = await getAiSettings();
  if (!apiKey) throw new Error('Kein API-Key hinterlegt. Bitte unter Einstellungen → KI eintragen.');

  const mode = CAPTURE_MODES[opts.mode] || CAPTURE_MODES.gross;
  const focus = (opts.focus || '').trim();

  const data = await callClaude({
    model,
    max_tokens: 8000,
    output_config: { format: { type: 'json_schema', schema: ITEM_SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Jpeg } },
        { type: 'text', text:
`Du bist ein Experte für Hausrat-Inventarisierung und Gebrauchtwarenbewertung.
${mode.prompt}
${focus ? `WICHTIGSTE ANWEISUNG des Nutzers für dieses Foto (hat Vorrang): ${focus}` : ''}
Für jeden erfassten Gegenstand: Name (deutsch, kurz), Kategorie, Zustand, geschätztes
Alter, Material, realistischer Wiederverkaufswert gebraucht in Euro (deutscher
Gebrauchtmarkt, z.B. Kleinanzeigen-Niveau), Anzahl und kurze Notizen (Marke/Schäden
falls sichtbar). Sei bei Werten realistisch-konservativ.
Wenn nichts Passendes zu sehen ist, gib eine leere Liste zurück.` },
      ],
    }],
  }, apiKey);

  const parsed = JSON.parse(firstText(data) || '{"items":[]}');
  return parsed.items || [];
}

/**
 * Findet Duplikate/Gleichartiges über beide Haushalte hinweg und bildet Cluster,
 * damit pro Gruppe entschieden werden kann, was bleibt und was wegkommt.
 * @param {Array<{id:string,name:string,category:string,house:string,condition:string,value:number|null}>} compactItems
 * @returns {Promise<Array<{title:string,reason:string,item_ids:string[]}>>}
 */
export async function clusterDuplicates(compactItems) {
  const { apiKey, model } = await getAiSettings();
  if (!apiKey) throw new Error('Kein API-Key hinterlegt. Bitte unter Einstellungen → KI eintragen.');

  const schema = {
    type: 'object',
    properties: {
      clusters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title:    { type: 'string', description: 'Kurzer Gruppenname, z.B. "Kaffeemaschinen" oder "Teller-Sets"' },
            reason:   { type: 'string', description: 'Ein Satz: warum diese Dinge zusammengehören und was zu entscheiden ist' },
            item_ids: { type: 'array', items: { type: 'string' }, description: 'IDs der Gegenstände in dieser Gruppe (mindestens 2)' },
          },
          required: ['title', 'reason', 'item_ids'],
          additionalProperties: false,
        },
      },
    },
    required: ['clusters'],
    additionalProperties: false,
  };

  const data = await callClaude({
    model,
    max_tokens: 8000,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{
      role: 'user',
      content: [{ type: 'text', text:
`Zwei Haushalte werden zusammengelegt. Hier ist das Inventar als JSON-Liste
(id, name, category, house = Standort, condition, value in Euro):

${JSON.stringify(compactItems)}

Finde Gruppen von Gegenständen mit GLEICHER FUNKTION, bei denen eine
Behalten-oder-Weg-Entscheidung sinnvoll ist — typischerweise Dinge, die doppelt
vorhanden sind (zwei Kaffeemaschinen, zwei Teller-Sets, zwei Sofas, mehrere
Besteck-Sets …). Bevorzuge Gruppen, deren Mitglieder aus VERSCHIEDENEN Standorten
stammen; gleichartige Dubletten am selben Standort sind auch erlaubt.
Jede Gruppe braucht mindestens 2 Einträge. Erfinde keine IDs.
Dinge ohne sinnvolles Gegenstück NICHT gruppieren. Keine Gruppe ist auch ok.` }],
    }],
  }, apiKey);

  const parsed = JSON.parse(firstText(data) || '{"clusters":[]}');
  return (parsed.clusters || []).filter((c) => Array.isArray(c.item_ids) && c.item_ids.length >= 2);
}

/**
 * Erzeugt einen Verkaufsanzeigen-Text + Preisvorschlag für einen Gegenstand.
 */
export async function suggestListing(item, base64Jpeg = null) {
  const { apiKey, model } = await getAiSettings();
  if (!apiKey) throw new Error('Kein API-Key hinterlegt. Bitte unter Einstellungen → KI eintragen.');

  const schema = {
    type: 'object',
    properties: {
      title:       { type: 'string', description: 'Anzeigentitel, max. 60 Zeichen' },
      description: { type: 'string', description: 'Verkaufstext, freundlich und ehrlich, 3-6 Sätze' },
      price_eur:   { type: 'number', description: 'Empfohlener Verkaufspreis in Euro' },
      price_note:  { type: 'string', description: 'Kurze Begründung des Preises' },
    },
    required: ['title','description','price_eur','price_note'],
    additionalProperties: false,
  };

  const content = [];
  if (base64Jpeg) {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Jpeg } });
  }
  content.push({ type: 'text', text:
`Erstelle für diesen Gegenstand eine Verkaufsanzeige für den deutschen Gebrauchtmarkt (z.B. Kleinanzeigen):
Name: ${item.name}
Zustand: ${item.condition || 'unbekannt'}
Alter: ${item.ageYears != null ? item.ageYears + ' Jahre' : 'unbekannt'}
Material: ${item.material || 'unbekannt'}
Eigene Wertschätzung: ${item.value != null ? item.value + ' €' : 'keine'}
Notizen: ${item.notes || '–'}
Schreibe ehrlich (Mängel erwähnen), freundlich und verkaufsfördernd. Nenne einen realistischen Preis.` });

  const data = await callClaude({
    model,
    max_tokens: 2000,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content }],
  }, apiKey);

  return JSON.parse(firstText(data));
}
