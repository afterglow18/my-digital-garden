/**
 * Backup & Restore for My Digital Garden.
 *
 * Export: bundles ALL clothing items (including embedded image data URLs) and
 *         saved outfits into a single JSON file, shared via the iOS Share Sheet.
 *
 * Import: reads a previously exported JSON file and re-inserts everything into
 *         the local IndexedDB — preserving IDs so outfit ↔ item links are intact.
 *
 * Format version 1:
 * {
 *   version: 1,
 *   exportedAt: ISO string,
 *   clothing: ClothingItem[],
 *   outfits:  { id, name, notes, createdAt, itemIds: number[] }[],
 * }
 */

import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { getDB, type ClothingItem, type StoredOutfit, type StoredOutfitItem } from "./db";

export const BACKUP_VERSION = 1;

export interface BackupOutfit {
  id:        number;
  name:      string;
  notes?:    string | null;
  createdAt: string;
  itemIds:   number[];
}

export interface BackupFile {
  version:    number;
  exportedAt: string;
  clothing:   ClothingItem[];
  outfits:    BackupOutfit[];
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportBackup(): Promise<void> {
  const db       = await getDB();
  const clothing = (await db.getAll("clothing_items")) as ClothingItem[];
  const outfits  = (await db.getAll("saved_outfits"))  as (StoredOutfit & { id: number })[];
  const links    = (await db.getAll("outfit_items"))   as StoredOutfitItem[];

  const backupOutfits: BackupOutfit[] = outfits.map((o) => ({
    id:        o.id,
    name:      o.name,
    notes:     o.notes ?? null,
    createdAt: o.createdAt,
    itemIds:   links.filter((l) => l.outfitId === o.id).map((l) => l.clothingItemId),
  }));

  const backup: BackupFile = {
    version:    BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    clothing,
    outfits: backupOutfits,
  };

  const json = JSON.stringify(backup, null, 2);
  const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const fileName = `my-digital-garden-backup-${dateStr}.json`;

  if (Capacitor.isNativePlatform()) {
    // Write to a temp file then share
    await Filesystem.writeFile({
      path:      fileName,
      data:      json,
      directory: Directory.Cache,
      encoding:  Encoding.UTF8,
    });

    const { uri } = await Filesystem.getUri({
      path:      fileName,
      directory: Directory.Cache,
    });

    // Share via iOS Share Sheet
    const { Share } = await import("@capacitor/share");
    await Share.share({
      title: "My Digital Garden Backup",
      text:  `Backup from ${dateStr} — ${clothing.length} items, ${outfits.length} outfits`,
      url:   uri,
    });
  } else {
    // Browser fallback — trigger download
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

// ── Import ────────────────────────────────────────────────────────────────────

export interface ImportResult {
  clothingAdded:  number;
  outfitsAdded:   number;
  skippedItems:   number;
}

export async function importBackup(json: string): Promise<ImportResult> {
  let backup: BackupFile;
  try {
    backup = JSON.parse(json);
  } catch {
    throw new Error("Invalid backup file — could not parse JSON");
  }

  if (backup.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${backup.version}`);
  }

  const db = await getDB();

  // ── Clothing items ─────────────────────────────────────────────────────────
  const existingIds = new Set<number>(
    ((await db.getAll("clothing_items")) as ClothingItem[]).map((i) => i.id)
  );

  let clothingAdded = 0, skippedItems = 0;
  const idRemap = new Map<number, number>(); // old id → new id

  for (const item of backup.clothing) {
    const { id: oldId, ...rest } = item;

    if (existingIds.has(oldId)) {
      // Already exists — skip to avoid duplicates
      idRemap.set(oldId, oldId);
      skippedItems++;
      continue;
    }

    const newId = await db.add("clothing_items", rest) as number;
    idRemap.set(oldId, newId);
    clothingAdded++;
  }

  // ── Outfits ────────────────────────────────────────────────────────────────
  const existingOutfitIds = new Set<number>(
    ((await db.getAll("saved_outfits")) as (StoredOutfit & { id: number })[]).map((o) => o.id)
  );

  let outfitsAdded = 0;

  for (const outfit of backup.outfits) {
    const { id: oldOutfitId, itemIds, ...outfitRest } = outfit;

    if (existingOutfitIds.has(oldOutfitId)) {
      skippedItems++;
      continue;
    }

    const newOutfitId = await db.add("saved_outfits", outfitRest) as number;

    for (const oldItemId of itemIds) {
      const newItemId = idRemap.get(oldItemId);
      if (newItemId == null) continue;
      await db.add("outfit_items", { outfitId: newOutfitId, clothingItemId: newItemId });
    }

    outfitsAdded++;
  }

  return { clothingAdded, outfitsAdded, skippedItems };
}

// ── File picker helper (browser + native) ────────────────────────────────────

export function pickBackupFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type   = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { reject(new Error("No file selected")); return; }
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.readAsText(file);
    };
    input.click();
  });
}
