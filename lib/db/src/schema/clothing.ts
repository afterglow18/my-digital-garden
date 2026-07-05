import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const CLOTHING_CATEGORIES = [
  "tops",
  "bottoms",
  "shoes",
  "accessories",
  "outerwear",
  "dresses",
] as const;

export type ClothingCategory = (typeof CLOTHING_CATEGORIES)[number];

export const clothingItemsTable = pgTable("clothing_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  imageObjectPath: text("image_object_path"),
  color: text("color"),
  brand: text("brand"),
  size: text("size"),
  season: text("season"),
  occasion: text("occasion"),
  purchasePrice: text("purchase_price"),
  purchaseDate: text("purchase_date"),
  notes: text("notes"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  timesWorn: integer("times_worn").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertClothingItemSchema = createInsertSchema(clothingItemsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClothingItem = z.infer<typeof insertClothingItemSchema>;
export type ClothingItem = typeof clothingItemsTable.$inferSelect;
