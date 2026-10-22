// Lecture du code-barres d'un livre avec la caméra (ISBN-13).
// BarcodeDetector natif quand il existe (Chrome/Android), sinon décodeur EAN-13
// maison sur des images de la caméra (iPhone/Safari). Tout reste sur l'appareil.
import { decodeEan13Image, isbnFromEan13, rgbaToGray } from "./ean13.js";

export function scannerSupported() {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function scannerErrorMessage(error) {
  const name = error?.name || "";
  if (name === "NotAllowedError" || name === "SecurityError") return "L’accès à la caméra est refusé. Autorisez-le dans les réglages du navigateur, ou tapez l’ISBN.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Aucune caméra utilisable n’a été trouvée. Tapez l’ISBN du livre.";
  if (name === "NotReadableError") return "La caméra est utilisée par une autre application.";
  return "La caméra n’a pas pu démarrer. Tapez l’ISBN du livre.";
}

// Démarre la caméra dans `video`. `onIsbn(isbn)` est appelé une seule fois.
// Retourne { stop }. La caméra est toujours coupée par stop(), par la
// disparition de la vidéo du DOM ou par le passage de l'onglet en arrière-plan.
export async function startBarcodeScan(video, { onIsbn, onError } = {}) {
  let stopped = false;
  let stream = null;
  let timer = 0;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onHidden);
    stream?.getTracks().forEach(track => track.stop());
    if (video) { try { video.pause(); } catch { /* ignoré */ } video.srcObject = null; }
  };
  const onHidden = () => { if (document.hidden) stop(); };

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (error) {
    stopped = true;
    onError?.(error);
    return { stop };
  }
  if (stopped || !video.isConnected) { stop(); return { stop }; }
  document.addEventListener("visibilitychange", onHidden);
  video.srcObject = stream;
  video.muted = true;
  video.setAttribute("playsinline", "");
  try { await video.play(); } catch (error) { stop(); onError?.(error); return { stop }; }

  const detector = typeof globalThis.BarcodeDetector === "function" ? (() => {
    try { return new globalThis.BarcodeDetector({ formats: ["ean_13"] }); } catch { return null; }
  })() : null;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  const found = isbn => {
    if (stopped || !isbn) return false;
    stop();
    onIsbn?.(isbn);
    return true;
  };

  const tick = async () => {
    if (stopped) return;
    if (!video.isConnected) { stop(); return; }
    try {
      if (video.readyState >= 2 && video.videoWidth) {
        if (detector) {
          const codes = await detector.detect(video);
          for (const code of codes) if (found(isbnFromEan13(code.rawValue))) return;
        } else {
          // Bande centrale de l'image : le code-barres est cadré au milieu.
          const width = Math.min(video.videoWidth, 960);
          const height = Math.round(width * video.videoHeight / video.videoWidth);
          canvas.width = width;
          canvas.height = height;
          context.drawImage(video, 0, 0, width, height);
          const bandTop = Math.floor(height * 0.25);
          const bandHeight = Math.max(1, Math.floor(height * 0.5));
          const data = context.getImageData(0, bandTop, width, bandHeight);
          if (found(isbnFromEan13(decodeEan13Image(rgbaToGray(data.data, width, bandHeight), width, bandHeight)))) return;
        }
      }
    } catch { /* image illisible : on réessaie */ }
    if (!stopped) timer = setTimeout(tick, detector ? 150 : 120);
  };
  tick();
  return { stop };
}
