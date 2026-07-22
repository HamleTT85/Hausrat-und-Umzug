// QR-Scanner: Etikett scannen → Detailseite öffnen (z.B. beim Auspacken).
import { scannerSupported, startScanner } from '../qr.js';
import { toast } from '../ui.js';

export async function renderScan(container) {
  if (!scannerSupported()) {
    container.innerHTML = `
      <h1 class="page-title">📷 <em>QR-Scan</em></h1>
      <div class="empty card"><div class="empty-ico">🙈</div>
        <div class="empty-title">Scanner hier nicht verfügbar</div>
        <p>Dieser Browser unterstützt die QR-Erkennung (BarcodeDetector) nicht.
        Auf Android/Chrome funktioniert es — alternativ kannst du den Code mit der
        Kamera-App scannen oder den Gegenstand über die Suche finden.</p>
        <a class="btn btn-primary" href="#/search">🔍 Zur Suche</a>
      </div>`;
    return;
  }

  container.innerHTML = `
    <h1 class="page-title">📷 <em>QR-Scan</em></h1>
    <p class="page-sub">Halte die Kamera auf ein HausRat-Etikett — der Eintrag öffnet sich automatisch.</p>
    <video class="scanner-video" id="scan-video" playsinline muted></video>
    <p class="small faint tc mt-1">Die Kamera läuft nur lokal, es wird nichts hochgeladen.</p>
  `;

  const video = container.querySelector('#scan-video');
  const stop = await startScanner(
    video,
    (itemId) => {
      toast('Gefunden! 🎯');
      location.hash = `#/item/${itemId}`;
    },
    (err) => {
      container.innerHTML = `
        <div class="empty card"><div class="empty-ico">🎥</div>
          <div class="empty-title">Kein Kamerazugriff</div>
          <p>${err?.message || 'Bitte Kamera-Berechtigung erteilen.'}</p></div>`;
    }
  );

  // Kamera stoppen, wenn die Ansicht verlassen wird
  const onLeave = () => {
    stop?.();
    window.removeEventListener('hashchange', onLeave);
  };
  window.addEventListener('hashchange', onLeave);
}
