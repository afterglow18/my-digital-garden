/**
 * useVisionIndexer — background hook that progressively enriches every
 * clothing item with vision labels and colour data for photo search.
 *
 * Version scheme:
 *   0 = unanalyzed
 *   2 = iOS Vision + canvas merged  (current iOS target)
 *   4 = web canvas, labels found    (current web target)
 *   5 = web canvas ran, no labels   (skip retry)
 *
 * Re-indexes anything below the current target version so items analyzed
 * with older logic (e.g. v1 iOS-only) are automatically upgraded.
 */
import { useEffect, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import type { ClothingItem } from "@/lib/db";
import { listClothing, updateClothingItem } from "@/lib/localDB";
import { getListClothingQueryKey } from "@/hooks/useLocalDB";
import {
  analyzeImage,
  VISION_VERSION_IOS,
  VISION_VERSION_WEB,
  VISION_VERSION_SKIP,
} from "@/lib/vision";

const DELAY_MS = 350;

function needsIndex(item: ClothingItem, isNative: boolean): boolean {
  if (!item.imageObjectPath) return false;
  const v = item.visionVersion ?? 0;
  if (isNative) {
    // Re-index anything below current iOS target (catches old v1 entries)
    return v < VISION_VERSION_IOS;
  }
  // Skip web items that were analyzed and found empty
  if (v === VISION_VERSION_SKIP) return false;
  return v < VISION_VERSION_WEB;
}

async function indexOneItem(item: ClothingItem): Promise<void> {
  if (!item.imageObjectPath) return;
  try {
    const isNative = Capacitor.isNativePlatform();
    const result   = await analyzeImage(item.imageObjectPath);

    const version = isNative
      ? VISION_VERSION_IOS
      : result.labels.length > 0
        ? VISION_VERSION_WEB
        : VISION_VERSION_SKIP;

    await updateClothingItem(item.id, {
      visionLabels:  result.labels,
      visionText:    result.text,
      visionVersion: version,
    } as Parameters<typeof updateClothingItem>[1]);
  } catch {
    // Fail silently — text search still works
  }
}

/** Hook — call once at app root. Shows isIndexing while background work runs. */
export function useVisionIndexer() {
  const [isIndexing, setIsIndexing] = useState(false);
  const queryClient = useQueryClient();
  const abortRef    = useRef(false);

  useEffect(() => {
    abortRef.current = false;
    let timer: ReturnType<typeof setTimeout>;
    const isNative = Capacitor.isNativePlatform();

    async function processQueue(items: ClothingItem[], i: number) {
      if (abortRef.current || i >= items.length) {
        setIsIndexing(false);
        return;
      }
      await indexOneItem(items[i]);
      if (!abortRef.current) {
        queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
      }
      timer = setTimeout(() => processQueue(items, i + 1), DELAY_MS);
    }

    async function start() {
      const all   = await listClothing();
      const queue = all.filter((item) => needsIndex(item, isNative));
      if (queue.length === 0) return;
      setIsIndexing(true);
      await processQueue(queue, 0);
    }

    start().catch(console.warn);
    return () => {
      abortRef.current = true;
      clearTimeout(timer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { isIndexing };
}

/**
 * Immediately analyze a single item (call after adding/replacing its photo).
 * Fire-and-forget — does not update React state; the next query refresh picks it up.
 */
export async function queueItemForVisionIndex(item: ClothingItem): Promise<void> {
  await indexOneItem(item).catch(console.warn);
}
