/**
 * Local IndexedDB database for My Digital Garden.
 *
 * Works in both the browser (Replit preview) and in the Capacitor iOS WebView —
 * IndexedDB is natively available in both environments and persists to the
 * app's sandboxed storage on-device.
 *
 * Schema v1:
 *   clothing_items  — wardrobe items with embedded image data URLs
 *   saved_outfits   — named outfit collections
 *   outfit_items    — junction: outfit ↔ clothing item
 *   settings        — key/value store for app preferences
 */

import { openDB, type IDBPDatabase } from "idb";

export const DB_NAME    = "my-digital-suitcase";
export const DB_VERSION = 1;

// ── Stored types (IndexedDB records) ─────────────────────────────────────────

export interface StoredClothingItem {
  id?:               number;        // auto-incremented
  name:              string;
  category:          string;        // "tools" | "landscaping" | "decor" | "plants"
  imageObjectPath:   string | null; // JPEG data URL  (e.g. "data:image/jpeg;base64,...")
  isFavorite:        boolean;
  timesWorn:         number;
  lastWateredDate?:  string | null;  // "YYYY-MM-DD" local date, plants only
  color?:            string | null;
  brand?:            string | null;
  size?:             string | null;
  season?:           string | null;
  occasion?:         string | null;
  purchasePrice?:    string | null;
  purchaseDate?:     string | null;
  notes?:            string | null;
  visionLabels?:     string[];
  visionText?:       string[];
  visionVersion?:    number;
  createdAt:         string;
  updatedAt:         string;
}

export interface StoredOutfit {
  id?:       number;
  name:      string;
  notes?:    string | null;
  createdAt: string;
}

export interface StoredOutfitItem {
  id?:             number;
  outfitId:        number;
  clothingItemId:  number;
}

export interface StoredSetting {
  key:   string;
  value: string;
}

// ── Public types (consumed by hooks and pages) ────────────────────────────────

// Vision fields stay optional so legacy DB records (pre-feature) are safely
// handled with `item.visionLabels ?? []` without TypeScript complaints.
export interface ClothingItem
  extends Omit<Required<StoredClothingItem>, "visionLabels" | "visionText" | "visionVersion"> {
  id: number;
  visionLabels?:  string[];
  visionText?:    string[];
  visionVersion?: number;
}

export interface SavedOutfit {
  id:        number;
  name:      string;
  notes?:    string | null;
  createdAt: string;
  items:     ClothingItem[];
}

// ── Singleton DB connection ───────────────────────────────────────────────────

let _db: IDBPDatabase | null = null;

export async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db;

  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // clothing_items
      if (!db.objectStoreNames.contains("clothing_items")) {
        const store = db.createObjectStore("clothing_items", {
          keyPath:       "id",
          autoIncrement: true,
        });
        store.createIndex("by_category", "category");
        store.createIndex("by_favorite", "isFavorite");
      }

      // saved_outfits
      if (!db.objectStoreNames.contains("saved_outfits")) {
        db.createObjectStore("saved_outfits", {
          keyPath:       "id",
          autoIncrement: true,
        });
      }

      // outfit_items
      if (!db.objectStoreNames.contains("outfit_items")) {
        const store = db.createObjectStore("outfit_items", {
          keyPath:       "id",
          autoIncrement: true,
        });
        store.createIndex("by_outfit", "outfitId");
        store.createIndex("by_item",   "clothingItemId");
      }

      // settings
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    },

    blocked() {
      console.warn("[DB] Upgrade blocked — close other tabs");
    },

    blocking() {
      _db?.close();
      _db = null;
    },
  });

  return _db;
}
