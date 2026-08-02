/**
 * Vision analysis bridge.
 *
 * Web:   canvas color extraction only (labels), no text.
 * iOS:   native VNClassifyImageRequest + VNRecognizeTextRequest run in parallel
 *        with canvas color extraction; results are merged and deduplicated.
 *
 * Version scheme (stored as visionVersion on each item):
 *   0 = unanalyzed
 *   2 = iOS Vision + canvas merged  (current iOS target)
 *   4 = web canvas result, labels found
 *   5 = web canvas ran but found no labels (don't retry)
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { extractColors } from "./colorExtractor";
import { getImageUrl } from "./utils";

interface NativeVisionPlugin {
  analyzeImage(options: { path: string }): Promise<{ labels: string[]; text: string[] }>;
}

const NativeVision = registerPlugin<NativeVisionPlugin>("Vision");

export interface VisionResult {
  labels: string[];
  text:   string[];
}

export const VISION_VERSION_IOS  = 2; // iOS Vision + canvas merged
export const VISION_VERSION_WEB  = 4; // web canvas, labels found
export const VISION_VERSION_SKIP = 5; // web canvas ran, no labels — skip retry

/**
 * Analyze an item image. Always returns { labels, text }.
 * Never throws — errors are swallowed and empty arrays returned.
 */
export async function analyzeImage(imagePath: string): Promise<VisionResult> {
  const isNative = Capacitor.isNativePlatform();
  const src = getImageUrl(imagePath) ?? imagePath;

  if (!isNative) {
    // Web-only: canvas color extraction
    const labels = await extractColors(src).catch(() => [] as string[]);
    return { labels, text: [] };
  }

  // iOS: run native Vision AND canvas color extraction in parallel, then merge
  const [nativeResult, canvasColors] = await Promise.all([
    NativeVision.analyzeImage({ path: imagePath }).catch(
      () => ({ labels: [] as string[], text: [] as string[] }),
    ),
    extractColors(src).catch(() => [] as string[]),
  ]);

  const merged = Array.from(new Set([...nativeResult.labels, ...canvasColors]));
  return { labels: merged, text: nativeResult.text };
}
