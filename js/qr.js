// QR-Codes: Erzeugen (vendor/qrcode.js, offline) und Scannen (BarcodeDetector).

/** Liefert ein <img>-Tag (DataURL) mit dem QR-Code für einen Item-Link. */
export function qrImgTag(text, sizePx = 180) {
  /* global qrcode */
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const cells = qr.getModuleCount();
  const cellSize = Math.max(2, Math.floor(sizePx / cells));
  return qr.createImgTag(cellSize, 8);
}

export function itemQrPayload(itemId) {
  return `hausrat:item:${itemId}`;
}

export function parseQrPayload(text) {
  const m = /^hausrat:item:(.+)$/.exec(text || '');
  return m ? m[1] : null;
}

export function scannerSupported() {
  return 'BarcodeDetector' in window;
}

/**
 * Startet die Kamera und ruft onResult(itemId) beim ersten gültigen Code auf.
 * Gibt eine stop()-Funktion zurück.
 */
export async function startScanner(videoEl, onResult, onError) {
  let stream, timer, stopped = false;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }, audio: false,
    });
    videoEl.srcObject = stream;
    await videoEl.play();
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    timer = setInterval(async () => {
      if (stopped) return;
      try {
        const codes = await detector.detect(videoEl);
        for (const c of codes) {
          const id = parseQrPayload(c.rawValue);
          if (id) { stop(); onResult(id); return; }
        }
      } catch { /* Frame übersprungen */ }
    }, 350);
  } catch (err) {
    onError?.(err);
  }
  function stop() {
    stopped = true;
    clearInterval(timer);
    stream?.getTracks().forEach((t) => t.stop());
  }
  return stop;
}
