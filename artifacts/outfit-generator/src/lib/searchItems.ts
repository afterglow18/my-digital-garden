/**
 * Pure search function for the Lookbook page.
 *
 * Scores items by field weight, scores groups by name/notes/contained items,
 * and deduplicates. Returns items first, then groups.
 */
import type { ClothingItem, SavedOutfit } from "@/lib/db";

export interface SearchResultItem  { kind: "item";  item: ClothingItem;  score: number; }
export interface SearchResultGroup { kind: "group"; outfit: SavedOutfit; score: number; }
export type SearchResult = SearchResultItem | SearchResultGroup;

// Field weights — higher = ranks more prominently
const FIELD_WEIGHTS: Array<[keyof ClothingItem, number]> = [
  ["name",          10],
  ["brand",          9],
  ["category",       6],
  ["color",          6],
  ["season",         5],
  ["occasion",       5],
  ["notes",          4],
  ["size",           3],
  ["purchasePrice",  2],
  ["purchaseDate",   2],
];

const VISION_WEIGHT = 1;

function scoreItem(item: ClothingItem, q: string): number {
  let score = 0;
  for (const [field, weight] of FIELD_WEIGHTS) {
    const val = String(item[field] ?? "").toLowerCase();
    if (val.includes(q)) score += weight;
  }
  if ((item.visionLabels ?? []).some((l) => l.toLowerCase().includes(q))) score += VISION_WEIGHT;
  if ((item.visionText   ?? []).some((t) => t.toLowerCase().includes(q))) score += VISION_WEIGHT;
  return score;
}

export function searchItems(
  query: string,
  allItems: ClothingItem[],
  outfits: SavedOutfit[],
): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // Score individual items
  const itemResults: SearchResultItem[] = [];
  const seenItemIds = new Set<number>();

  for (const item of allItems) {
    const score = scoreItem(item, q);
    if (score > 0) {
      itemResults.push({ kind: "item", item, score });
      seenItemIds.add(item.id);
    }
  }
  itemResults.sort((a, b) => b.score - a.score);

  // Score groups
  const groupResults: SearchResultGroup[] = [];

  for (const outfit of outfits) {
    let groupScore = 0;
    if (outfit.name.toLowerCase().includes(q))           groupScore += 8;
    if ((outfit.notes ?? "").toLowerCase().includes(q))  groupScore += 4;

    for (const item of outfit.items ?? []) {
      const s = scoreItem(item, q);
      if (s > 0) groupScore += Math.min(s, 5);
    }

    if (groupScore > 0) groupResults.push({ kind: "group", outfit, score: groupScore });
  }
  groupResults.sort((a, b) => b.score - a.score);

  return [...itemResults, ...groupResults];
}
