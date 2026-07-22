# 🛋️ HausRat — Digitales Hausinventar & Umzugsplaner

Eine **komplett lokale Web-App** für die Inventur deines Zuhauses — mit KI-Bilderkennung,
Umzugsplanung und Verkaufshilfe. Kein Server, kein Konto, keine Cloud: Alle Daten
(inklusive Fotos) bleiben in deinem Browser (IndexedDB).

![Konzept](https://img.shields.io/badge/100%25-lokal-c05e2f) ![Mobile](https://img.shields.io/badge/mobile-optimiert-4e7d4e) ![Build](https://img.shields.io/badge/build-nicht%20n%C3%B6tig-3d6a8a)

## ✨ Was die App kann

| Bereich | Funktionen |
|---|---|
| 📸 **KI-Erfassung** | Raum fotografieren → Claude erkennt automatisch alle Möbel & Geräte mit Name, Kategorie, Zustand, Alter, Material, Anzahl und **realistischem Wiederverkaufswert**. Du wählst per Checkbox, was übernommen wird. |
| 🏠 **Hierarchie** | Haus → Etage → Raum → Gegenstand. Du weißt immer, wo etwas steht — auch über mehrere Standorte (Wohnung + Elternhaus). |
| 🏷️ **Status & Priorität** | Jeder Gegenstand: *Behalten · Umziehen · Verkaufen · Verschenken · Entsorgen · Einlagern* + Priorität (*Sofort · Vor/Nach dem Umzug · Irgendwann*). Jederzeit per Tipp änderbar. |
| 🔍 **Suche & Filter** | Volltextsuche + Filter nach Status, Kategorie, Priorität und Standort. |
| 🖼️ **Detailseiten** | Fotogalerie pro Gegenstand, Titelbild wählbar, Notizen, alle Eigenschaften editierbar. |
| 🔖 **QR-Etiketten** | Pro Gegenstand ein QR-Code zum Ausdrucken (offline generiert). Scannen öffnet direkt den Eintrag — perfekt für Umzugskartons. |
| 🚚 **Umzugsplaner** | Umzugstag mit Countdown, Adressen, Helfer- und Fahrzeugliste, Transport-Status pro Gegenstand (*Offen → Verpackt → Verladen → Angekommen → Ausgepackt*) mit Fortschrittsbalken. |
| 💰 **Verkaufshilfe** | Verkaufsliste mit Gesamtwert. Die KI schreibt pro Gegenstand **Anzeigentitel, ehrlichen Verkaufstext und Preisvorschlag** (Kleinanzeigen-Niveau) — auf Wunsch mit Foto-Analyse. |
| 🌗 **Design** | Warmes, wohnliches UI · Dark-/Light-Mode · Bottom-Navigation mit großem Kamera-Button · für Handy und Desktop. |
| 💾 **Backup** | Export/Import als JSON-Datei (inkl. Fotos) — für Gerätewechsel oder Sicherung. |

## 🚀 Starten

Kein Build-Schritt, keine Abhängigkeiten installieren. Nur ein statischer Webserver
(nötig wegen ES-Modulen und Kamera-Zugriff):

```bash
cd furniture-inventory
python3 -m http.server 8080
# → http://localhost:8080
```

Oder mit Node: `npx serve .`

**Am Handy nutzen:** Rechner und Handy ins gleiche WLAN, dann `http://<IP-des-Rechners>:8080`
öffnen. Für Kamera-Zugriff außerhalb von `localhost` verlangt der Browser HTTPS —
am einfachsten mit `npx serve . --ssl-cert`-Setup, Tailscale/`localhost.run`, oder du
hostest den Ordner z.B. auf einem Pi mit selbstsigniertem Zertifikat.

**Erster Eindruck:** Unter *Einstellungen → Beispieldaten laden* gibt es einen fertigen
Demo-Bestand zum Ausprobieren.

## 🤖 KI einrichten (optional, aber das Herzstück)

1. API-Key auf [platform.claude.com](https://platform.claude.com) erstellen
2. In der App: *⚙️ Einstellungen → KI-Erkennung → Key eintragen*
3. Modell wählen:
   - **Claude Opus 4.8** — beste Erkennung & Wertschätzung (Standard)
   - **Claude Sonnet 5** — schneller und günstiger
   - **Claude Haiku 4.5** — am günstigsten

Der Key wird ausschließlich lokal (IndexedDB) gespeichert. Fotos werden nur für die
Analyse direkt an die Anthropic-API geschickt — es gibt keinen Zwischenserver.
Ohne Key funktioniert alles außer der automatischen Erkennung; Einträge legst du
dann manuell an.

## 🗂️ Technik

- **Vanilla JS (ES-Module)** — kein Framework, kein Bundler, keine npm-Installation
- **IndexedDB** für alle Daten, Fotos als Blobs (verkleinert auf max. 1568 px)
- **Claude Messages API** mit *Structured Outputs* (JSON-Schema) für verlässlich
  parsebare Erkennungsergebnisse; direkter Browser-Zugriff (CORS-Header)
- **QR-Erzeugung** offline via `qrcode-generator` (MIT, in `vendor/` eingebettet)
- **QR-Scan** über die native `BarcodeDetector`-API (Chrome/Android; mit Fallback-Hinweis)

```
furniture-inventory/
├── index.html          App-Shell (Topbar, Bottom-Nav)
├── css/app.css         Design-System (Light/Dark, Komponenten)
├── js/
│   ├── app.js          Router & Theme
│   ├── db.js           IndexedDB-Wrapper, Export/Import
│   ├── data.js         Kategorien, Status, Demo-Daten
│   ├── ai.js           Claude-Anbindung (Foto-Analyse, Verkaufstexte)
│   ├── qr.js           QR erzeugen & scannen
│   ├── ui.js           Toasts, Sheets, Karten, Bild-Verkleinerung
│   └── views/          Dashboard, Bestand, Detail, Erfassen, Suche,
│                       Umzug, Verkauf, Einstellungen, Scanner
└── vendor/qrcode.js    QR-Bibliothek (MIT)
```

## 🗺️ Ideen für später

- PWA-Manifest + Service Worker („App installieren“, komplett offline)
- Kartonverwaltung (Karton = Container mit eigenem QR, Gegenstände zuordnen)
- Etiketten-Druckbogen (mehrere QR-Codes pro A4-Seite)
- Statistiken (Wert pro Raum/Kategorie als Diagramm)
- Mehrbenutzer-Sync über eine optionale eigene Backend-Anbindung
