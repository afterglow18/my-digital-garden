/**
 * Background removal — wraps @imgly/background-removal with three critical fixes
 * for iOS Safari / WKWebView:
 *
 * 1. Object.defineProperty proxy lock
 *    @imgly/background-removal resets ort.env.wasm.proxy = false right before it
 *    creates its inference session (it only enables the proxy for WebGPU, which
 *    iOS Safari doesn't have). We use defineProperty with a no-op setter so that
 *    write is silently ignored and the value stays true — keeping ONNX inference
 *    in a Web Worker instead of freezing the main thread.
 *
 * 2. numThreads = 1
 *    WASM multithreading requires SharedArrayBuffer, which iOS Safari doesn't
 *    expose inside WKWebView. More than 1 thread causes a silent crash.
 *
 * 3. Dynamic import() for onnxruntime-web
 *    A top-level import triggered Vite's dependency pre-bundling mid-session,
 *    causing a full page reload that corrupted React's internal dispatcher.
 *    Importing dynamically (inside the async function) defers the load until
 *    the moment inference is first requested — after everything is stable.
 */

// Runs once, just before the first removeBackground() call.
// Uses a promise so concurrent callers all wait on the same initialisation.
let ortSetup: Promise<void> | null = null;

function ensureOrtConfigured(): Promise<void> {
  if (ortSetup) return ortSetup;
  ortSetup = (async () => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — onnxruntime-web types don't resolve through its exports map
    const ort = await import("onnxruntime-web");
    Object.defineProperty(ort.env.wasm, "proxy", {
      get: () => true,
      set: () => {},   // silently blocks imgly's internal proxy = false write
      configurable: true,
    });
    ort.env.wasm.numThreads = 1;
  })();
  return ortSetup;
}

/**
 * Remove the background from a JPEG/PNG base64 data-URL.
 * Returns a PNG data-URL with a transparent background.
 * Inference runs in a Web Worker — main thread stays responsive.
 * On first ever call downloads the ~15 MB ONNX model (cached after that).
 * Throws on network error or unreadable image — callers should catch and fall back.
 */
export async function removeBackground(dataUrl: string): Promise<string> {
  // Configure ORT first, then import imgly — order matters because imgly's
  // internal code reads ort.env.wasm.proxy when it creates its session.
  await ensureOrtConfigured();
  const { removeBackground: imglyRemoveBackground } = await import("@imgly/background-removal");

  const sourceBlob = await dataUrlToBlob(dataUrl);
  const resultBlob = await imglyRemoveBackground(sourceBlob, {
    model: "isnet_fp16", // valid: "isnet" | "isnet_fp16" | "isnet_quint8"
    output: { format: "image/png", quality: 0.9 },
  });
  return blobToDataUrl(resultBlob);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}
