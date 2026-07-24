// Stammdaten: Kategorien, Status, Prioritäten, Zustände, Demo-Daten.
import { db, uid, getMeta, setMeta } from './db.js';

export const CATEGORIES = {
  sofa_sessel:    { label: 'Sofa & Sessel',      icon: '🛋️' },
  tische:         { label: 'Tische',             icon: '🪵' },
  stuehle:        { label: 'Stühle & Bänke',     icon: '🪑' },
  schraenke:      { label: 'Schränke & Regale',  icon: '🗄️' },
  betten:         { label: 'Betten & Matratzen', icon: '🛏️' },
  lampen:         { label: 'Lampen & Leuchten',  icon: '💡' },
  elektro:        { label: 'Elektrogeräte',      icon: '🔌' },
  kueche:         { label: 'Küche & Geschirr',   icon: '🍽️' },
  deko:           { label: 'Deko & Kunst',       icon: '🖼️' },
  textilien:      { label: 'Teppiche & Textil',  icon: '🧶' },
  buecher_medien: { label: 'Bücher & Medien',    icon: '📚' },
  werkzeug:       { label: 'Werkzeug & Garten',  icon: '🛠️' },
  sport_freizeit: { label: 'Sport & Freizeit',   icon: '🚲' },
  spielzeug:      { label: 'Kinder & Spielzeug', icon: '🧸' },
  sonstiges:      { label: 'Sonstiges',          icon: '📦' },
};

export const STATUSES = {
  unentschieden: { label: 'Unentschieden', icon: '🤔', chip: 'chip' },
  behalten:      { label: 'Behalten',      icon: '💚', chip: 'chip-ok' },
  umziehen:      { label: 'Umziehen',      icon: '🚚', chip: 'chip-info' },
  verkaufen:     { label: 'Verkaufen',     icon: '💰', chip: 'chip-warn' },
  verschenken:   { label: 'Verschenken',   icon: '🎁', chip: 'chip-violet' },
  entsorgen:     { label: 'Entsorgen',     icon: '🗑️', chip: 'chip-danger' },
  einlagern:     { label: 'Einlagern',     icon: '📦', chip: 'chip-accent' },
};

export const PRIORITIES = {
  sofort:      { label: 'Sofort erledigen',  icon: '🔥', chip: 'chip-danger' },
  vor_umzug:   { label: 'Vor dem Umzug',     icon: '⏳', chip: 'chip-warn' },
  nach_umzug:  { label: 'Nach dem Umzug',    icon: '🌤️', chip: 'chip-info' },
  irgendwann:  { label: 'Irgendwann',        icon: '🐢', chip: 'chip' },
};

export const CONDITIONS = {
  neuwertig:   'Neuwertig',
  sehr_gut:    'Sehr gut',
  gut:         'Gut',
  gebraucht:   'Gebraucht',
  abgenutzt:   'Abgenutzt',
  defekt:      'Defekt',
};

export const TRANSPORT = {
  offen:         { label: 'Offen',        icon: '⚪' },
  verpackt:      { label: 'Verpackt',     icon: '📦' },
  verladen:      { label: 'Verladen',     icon: '🚚' },
  angekommen:    { label: 'Angekommen',   icon: '🏠' },
  ausgepackt:    { label: 'Ausgepackt',   icon: '✅' },
};

// Fahrten/Ziele: Wohin geht der Gegenstand? Frei anpassbar im Umzugsplaner.
export const DEFAULT_DESTINATIONS = [
  { id: 'nebenan',      icon: '🏡', name: 'Rüber nebenan' },
  { id: 'muenchen',     icon: '🚗', name: 'Fahrt nach München' },
  { id: 'werkstoffhof', icon: '♻️', name: 'Werkstoffhof / Spende' },
];

/** Umzugsplan mit garantierten Defaults (inkl. Fahrten- und Personen-Liste) laden. */
export async function getMovePlan() {
  const saved = (await getMeta('movePlan')) || {};
  const plan = {
    date: '', fromAddress: '', toAddress: '', helpers: [], vehicles: [], notes: '',
    ...saved,
  };
  if (!Array.isArray(plan.destinations) || !plan.destinations.length) {
    plan.destinations = DEFAULT_DESTINATIONS.map((d) => ({ ...d }));
  }
  if (!Array.isArray(plan.people) || plan.people.length < 2) {
    plan.people = ['Pascal', 'Nadine'];
  }
  // Alte Platzhalter-Namen einmalig auf die echten umstellen
  if (plan.people[0] === 'Ich' && plan.people[1] === 'Partnerin') {
    plan.people = ['Pascal', 'Nadine'];
  }
  return plan;
}

// „Gemeinsam entscheiden“: mögliche Wünsche pro Person und was bei Einigkeit passiert.
export const WISH_CHOICES = {
  hier:     { label: 'Hier im Haus', icon: '🏡', apply: { status: 'umziehen',  destination: 'nebenan' } },
  muenchen: { label: 'Nach München', icon: '🚗', apply: { status: 'umziehen',  destination: 'muenchen' } },
  weg:      { label: 'Weg damit',    icon: '🗑️', apply: { status: 'entsorgen', destination: 'werkstoffhof' } },
  egal:     { label: 'Mir egal',     icon: '🤷', apply: null },
};

export const ROOM_ICONS =['🛋️','🍳','🛏️','🛁','🚪','🧺','🖥️','🧸','📚','🌿','🚗','🍷','🧰','📦'];
export const HOUSE_ICONS = ['🏠','🏡','🏢','🏚️','🏰','🛖'];

export function newItem(roomId, partial = {}) {
  const now = new Date().toISOString();
  return {
    id: uid('item'),
    roomId,
    name: '',
    category: 'sonstiges',
    status: 'unentschieden',
    priority: 'irgendwann',
    condition: 'gut',
    ageYears: null,
    material: '',
    value: null,          // geschätzter Wiederverkaufswert in €
    quantity: 1,
    notes: '',
    photoIds: [],
    transport: 'offen',
    destination: '',      // Fahrt/Ziel-Id aus dem Umzugsplan ('' = offen)
    sale: { price: null, description: '' },
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function fmtEuro(v) {
  if (v == null || v === '' || isNaN(v)) return '–';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
}

// ---------- Demo-Daten ----------
export async function loadDemoData() {
  const h1 = { id: uid('house'), name: 'Wohnung', icon: '🏢' };
  const h2 = { id: uid('house'), name: 'Elternhaus', icon: '🏡' };
  await db.put('houses', h1); await db.put('houses', h2);

  const f1 = { id: uid('floor'), houseId: h1.id, name: '3. OG', level: 3 };
  const f2 = { id: uid('floor'), houseId: h2.id, name: 'Erdgeschoss', level: 0 };
  const f3 = { id: uid('floor'), houseId: h2.id, name: 'Keller', level: -1 };
  for (const f of [f1, f2, f3]) await db.put('floors', f);

  const r1 = { id: uid('room'), floorId: f1.id, houseId: h1.id, name: 'Wohnzimmer', icon: '🛋️' };
  const r2 = { id: uid('room'), floorId: f1.id, houseId: h1.id, name: 'Küche', icon: '🍳' };
  const r3 = { id: uid('room'), floorId: f2.id, houseId: h2.id, name: 'Esszimmer', icon: '🍷' };
  const r4 = { id: uid('room'), floorId: f3.id, houseId: h2.id, name: 'Kellerraum', icon: '📦' };
  for (const r of [r1, r2, r3, r4]) await db.put('rooms', r);

  const demo = [
    newItem(r1.id, { name: 'Ecksofa "Söderhamn"', category: 'sofa_sessel', status: 'umziehen', priority: 'vor_umzug', condition: 'sehr_gut', ageYears: 3, material: 'Stoff, Holzrahmen', value: 450, notes: 'Bezug waschbar, ein Kissen fehlt.' }),
    newItem(r1.id, { name: 'Bücherregal Eiche', category: 'schraenke', status: 'behalten', priority: 'nach_umzug', condition: 'gut', ageYears: 8, material: 'Eiche massiv', value: 220 }),
    newItem(r1.id, { name: 'Stehlampe Messing', category: 'lampen', status: 'verkaufen', priority: 'sofort', condition: 'sehr_gut', ageYears: 2, material: 'Messing, Leinen', value: 85, sale: { price: 90, description: '' } }),
    newItem(r2.id, { name: 'Kühlschrank Bosch', category: 'elektro', status: 'verkaufen', priority: 'vor_umzug', condition: 'gut', ageYears: 5, material: 'Metall', value: 180 }),
    newItem(r2.id, { name: 'Geschirr-Set (12-tlg.)', category: 'kueche', status: 'verschenken', priority: 'irgendwann', condition: 'gebraucht', ageYears: 10, material: 'Porzellan', value: 25 }),
    newItem(r3.id, { name: 'Esstisch ausziehbar', category: 'tische', status: 'unentschieden', priority: 'irgendwann', condition: 'gut', ageYears: 15, material: 'Kirschbaum', value: 300, notes: 'Familienerbstück? Mit Mama klären.' }),
    newItem(r3.id, { name: '6 Esszimmerstühle', category: 'stuehle', status: 'unentschieden', priority: 'irgendwann', condition: 'gebraucht', ageYears: 15, material: 'Kirschbaum, Polster', value: 150, quantity: 6 }),
    newItem(r4.id, { name: 'Ski-Ausrüstung', category: 'sport_freizeit', status: 'einlagern', priority: 'nach_umzug', condition: 'gut', ageYears: 4, material: '', value: 120 }),
    newItem(r4.id, { name: 'Alter Röhrenfernseher', category: 'elektro', status: 'entsorgen', priority: 'sofort', condition: 'defekt', ageYears: 20, material: '', value: 0 }),
  ];
  for (const it of demo) await db.put('items', it);

  // Ein paar Demo-Ziele zuweisen
  demo[0].destination = 'nebenan';
  demo[3].destination = 'muenchen';
  demo[8].destination = 'werkstoffhof';
  for (const it of [demo[0], demo[3], demo[8]]) await db.put('items', it);

  await setMeta('movePlan', {
    destinations: DEFAULT_DESTINATIONS.map((d) => ({ ...d })),
    date: futureDate(45),
    fromAddress: 'Alte Straße 12, 50667 Köln',
    toAddress: 'Neue Allee 7, 40210 Düsseldorf',
    helpers: [
      { id: uid('h'), name: 'Lena', phone: '', note: 'Hat Bohrmaschine' },
      { id: uid('h'), name: 'Jonas', phone: '', note: 'Nur vormittags' },
    ],
    vehicles: [
      { id: uid('v'), name: 'Sprinter (Miete)', note: '3,5t · gebucht 8–18 Uhr' },
    ],
    notes: 'Halteverbotszone beantragen!',
  });
}

function futureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
