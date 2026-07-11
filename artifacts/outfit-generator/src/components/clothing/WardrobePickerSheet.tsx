/**
 * WardrobePickerSheet
 *
 * Slide-up sheet that shows existing wardrobe items for a given category.
 * Tapping an item adds it to the outfit.  An "Add New" button at the bottom
 * falls through to QuickAddSheet so the user can upload a brand-new piece.
 */
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus } from "lucide-react";
import {
  useListClothing,
  getListClothingQueryKey,
  ListClothingCategory,
  ClothingItem,
} from "@workspace/api-client-react";
import { getImageUrl } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { QuickAddSheet } from "./QuickAddSheet";

type Category = "makeup" | "skincare" | "hair" | "fragrances";

const CATEGORY_LABELS: Record<Category, string> = {
  makeup:     "Makeup",
  skincare:   "Skincare",
  hair:       "Hair",
  fragrances: "Fragrance",
};

interface Props {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  category:     Category;
  /** Called with the chosen item so the parent can add it to the outfit */
  onPick:       (item: ClothingItem) => void;
  /** Items already in the outfit — shown with a checkmark but still tappable */
  existingItemIds?: number[];
}

export function WardrobePickerSheet({ open, onOpenChange, category, onPick, existingItemIds = [] }: Props) {
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const queryClient = useQueryClient();

  // Fetch all items in this category
  const params = { category: category as ListClothingCategory };
  const { data: items, isLoading } = useListClothing(
    params,
    { query: { queryKey: getListClothingQueryKey(params), enabled: open } }
  );

  const label = CATEGORY_LABELS[category];

  const handleClose = () => onOpenChange(false);

  const handlePick = (item: ClothingItem) => {
    onPick(item);
    onOpenChange(false);
  };

  const handleNewlyAdded = (item: ClothingItem) => {
    queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
    setShowQuickAdd(false);
    // Immediately add the brand-new item to the outfit
    onPick(item);
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: "100%" }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 240 }}
        className="fixed inset-0 z-[70] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b-2 border-black flex-shrink-0">
          <h2 className="font-display font-bold text-xl uppercase tracking-tight">
            Pick {/^[aeiou]/i.test(label) ? 'an' : 'a'} {label}
          </h2>
          <button
            onClick={handleClose}
            className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                       bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                       active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Item grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <span className="text-sm text-muted-foreground animate-pulse">Loading your vanity…</span>
            </div>
          ) : items && items.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {items.map((item) => {
                const alreadyIn = existingItemIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => handlePick(item)}
                    className="flex flex-col gap-1 text-left group"
                  >
                    <div className="relative w-full aspect-square border-2 border-black overflow-hidden"
                      style={{ background: "#FDECEF" }}>
                      {item.imageObjectPath ? (
                        <img
                          src={getImageUrl(item.imageObjectPath)!}
                          alt={item.name}
                          className="w-full h-full object-contain transition-opacity group-active:opacity-70"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-2xl">👕</span>
                        </div>
                      )}
                      {alreadyIn && (
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <span className="text-white text-xs font-bold uppercase tracking-wide bg-black/60 px-1.5 py-0.5 rounded">
                            In look
                          </span>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-black/60 truncate w-full">
                      {item.name}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
              <span className="text-4xl">💄</span>
              <p className="text-sm text-muted-foreground font-medium">
                No {label.toLowerCase()} in your vanity yet.
              </p>
            </div>
          )}
        </div>

        {/* Footer — Add New button */}
        <div className="p-4 border-t-2 border-black bg-white flex-shrink-0">
          <button
            onClick={() => setShowQuickAdd(true)}
            className="w-full flex items-center justify-center gap-2 py-3
                       border-4 border-black rounded-2xl bg-primary font-display font-bold
                       text-base uppercase tracking-tight
                       shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
                       active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
          >
            <Plus className="w-5 h-5" />
            Add New {label} to Vanity
          </button>
        </div>
      </motion.div>

      {/* QuickAddSheet for uploading a brand-new item */}
      <AnimatePresence>
        {showQuickAdd && (
          <QuickAddSheet
            open
            onOpenChange={(o) => setShowQuickAdd(o)}
            category={category}
            existingCount={items?.length ?? 0}
            onCreated={handleNewlyAdded}
          />
        )}
      </AnimatePresence>
    </>
  );
}
