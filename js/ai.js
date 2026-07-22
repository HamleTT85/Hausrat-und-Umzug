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
          category:   { type: 'string', enum: ['sofa_sessel','tische','stuehle','schraenke','betten','lampen','elektro','kueche','deko','textilien','buecher_medien','werkzeug','sport_freizeit','sonstiges'] },
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

/**
 * Analysiert ein Raumfoto und erkennt alle Einrichtungsgegenstände.
 * @param {string} base64Jpeg  Bilddaten (JPEG, ohne data:-Präfix)
 * @returns {Promise<Array>} erkannte Gegenstände
 */
export async function analyzePhoto(base64Jpeg) {
  const { apiKey, model } = await getAiSettings();
  if (!apiKey) throw new Error('Kein API-Key hinterlegt. Bitte unter Einstellungen → KI eintragen.');

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
Erkenne auf diesem Foto alle relevanten Einrichtungsgegenstände, Möbel und Geräte
(keine Kleinteile wie einzelne Stifte oder Lebensmittel). Für jeden Gegenstand:
Name (deutsch, kurz), Kategorie, Zustand, geschätztes Alter, Material,
realistischer Wiederverkaufswert gebraucht in Euro (deutscher Gebrauchtmarkt,
z.B. Kleinanzeigen-Niveau), Anzahl und kurze Notizen (Marke/Schäden falls sichtbar).
Sei bei Werten realistisch-konservativ. Wenn nichts Relevantes zu sehen ist, gib eine leere Liste zurück.` },
      ],
    }],
  }, apiKey);

  const parsed = JSON.parse(firstText(data) || '{"items":[]}');
  return parsed.items || [];
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
