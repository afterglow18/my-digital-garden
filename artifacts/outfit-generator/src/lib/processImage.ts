/**
 * Removes the background from a clothing photo, then crops and centers
 * the subject on a square transparent-PNG canvas.
 *
 * Uses @imgly/background-removal (browser-side, no API key needed).
 * Model files are streamed from the jsDelivr CDN on first call
 * and cached in the browser thereafter.
 */
import { removeBackground } from "@imgly/background-removal";

const CDN_VERSION = "1.7.0";
const PUBLIC_PATH = `https://cdn.jsdelivr.net/npm/@imgly/background-removal@${CDN_VERSION}/dist/web/`;

export type ProgressCallback = (percent: number) => void;

export async function processClothingImage(
  input: File | Blob,
  onProgress?: ProgressCallback
): Promise<Blob> {
  // Phase 1 – background removal (0-80%)
  const bgFree = await removeBackground(input, {
    publicPath: PUBLIC_PATH,
    model: "isnet_quint8", // smallest/fastest quantised model
    output: { format: "image/png", quality: 1 },
    progress: (_key: string, current: number, total: number) => {
      if (onProgress && total > 0) {
        onProgress(Math.min(80, Math.round((current / total) * 80)));
      }
    },
  });

  onProgress?.(85);

  // Phase 2 – crop to content bounds + pad to square (85-100%)
  const result = await cropAndCenterPng(bgFree);

  onProgress?.(100);
  return result;
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function cropAndCenterPng(blob: Blob): Promise<Blob> {
  // Decode the PNG
  const bitmap = await createImageBitmap(blob);

  const analysisCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = analysisCanvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(bitmap, 0, 0);

  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const { data, width, height } = imageData;

  // Find the tight bounding box of non-transparent pixels
  let minX = width, minY = height, maxX = 0, maxY = 0;
  let hasContent = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        hasContent = true;
      }
    }
  }

  if (!hasContent) return blob; // Nothing found — return original

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  // Add 6% padding around the tightest crop
  const pad  = Math.round(Math.max(cropW, cropH) * 0.06);
  const size = Math.max(cropW, cropH) + pad * 2;

  const out    = new OffscreenCanvas(size, size);
  const outCtx = out.getContext("2d") as OffscreenCanvasRenderingContext2D;

  // Draw just the cropped region, centred in the square output
  outCtx.drawImage(
    analysisCanvas,
    minX,
    minY,
    cropW,
    cropH,
    Math.round((size - cropW) / 2),
    Math.round((size - cropH) / 2),
    cropW,
    cropH,
  );

  return out.convertToBlob({ type: "image/png", quality: 1 });
}
