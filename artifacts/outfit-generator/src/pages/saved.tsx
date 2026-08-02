import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  useListOutfits,
  useListClothing,
  useDeleteOutfit,
  useRenameOutfit,
  useAddItemToOutfit,
  useRemoveItemFromOutfit,
  getListOutfitsQueryKey,
  type ClothingItem,
} from "@/hooks/useLocalDB";
import { Trash2, Bookmark, Plus, Pencil, Check, X, Search, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getImageUrl } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useEntitlements } from "@/hooks/useEntitlements";
import { UpgradeSheet } from "@/components/paywall/UpgradeSheet";
import { FREE_OUTFIT_LIMIT } from "@/lib/entitlements";
import { WardrobePickerSheet } from "@/components/clothing/WardrobePickerSheet";
import { ItemDetailsSheet } from "@/components/clothing/ItemDetailsSheet";
import { searchItems, type SearchResultItem, type SearchResultGroup } from "@/lib/searchItems";

const SLOT_ORDER = ["tools", "landscaping", "decor", "plants"] as const;
type SlotKey = (typeof SLOT_ORDER)[number];

const SLOT_LABELS: Record<SlotKey, string> = {
  tools:       "🧤 Tools & Supplies",
  landscaping: "🪨 Landscaping",
  decor:       "🌿 Garden Décor",
  plants:      "🌱 Plants",
};

function ItemPhoto({
  item,
  size = "md",
  onClick,
}: {
  item: ClothingItem;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
}) {
  const sizeClass = size === "lg" ? "h-28" : size === "md" ? "h-20" : "h-14";
  return (
    <button
      onClick={onClick}
      className={`w-full ${sizeClass} border-2 border-black overflow-hidden relative`}
      style={{ background: "#F5EDD8", padding: 0, display: "block" }}
    >
      {item.imageObjectPath ? (
        <img
          src={getImageUrl(item.imageObjectPath)!}
          alt={item.name}
          className="w-full h-full object-contain"
          style={{ objectFit: "contain", objectPosition: "center" }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center p-1">
          <span className="text-[9px] font-bold uppercase text-center leading-tight text-black/30">—</span>
        </div>
      )}
      {item.isFavorite && (
        <span className="absolute top-1 right-1 text-[10px] leading-none">❤️</span>
      )}
    </button>
  );
}

// ── Small thumbnail for search results ───────────────────────────────────────
function Thumb({ item, size = 48 }: { item?: ClothingItem; size?: number }) {
  return (
    <div
      className="border-2 border-black overflow-hidden rounded flex-shrink-0"
      style={{ width: size, height: size, background: "#F5EDD8" }}
    >
      {item?.imageObjectPath ? (
        <img
          src={getImageUrl(item.imageObjectPath)!}
          alt={item.name}
          className="w-full h-full object-contain"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-[8px] font-bold text-black/25">—</span>
        </div>
      )}
    </div>
  );
}

export default function SavedPage() {
  const { data: outfits, isLoading } = useListOutfits();
  const { data: allItems = [] }      = useListClothing({});
  const deleteOutfit                 = useDeleteOutfit();
  const renameOutfit                 = useRenameOutfit();
  const removeItemFromOutfit         = useRemoveItemFromOutfit();
  const addItemToOutfit              = useAddItemToOutfit();
  const queryClient                  = useQueryClient();
  const { tier }                     = useEntitlements();

  const [showUpgrade,   setShowUpgrade]   = useState(false);
  const [replacingSlot, setReplacingSlot] = useState<{ outfitId: number; category: SlotKey } | null>(null);
  const [addingExtra,   setAddingExtra]   = useState<number | null>(null);
  const [detailsItem,   setDetailsItem]   = useState<ClothingItem | null>(null);
  const [detailsFromSearch, setDetailsFromSearch] = useState(false);
  const [renamingId,    setRenamingId]    = useState<number | null>(null);
  const [renameValue,   setRenameValue]   = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [editingNotesId, setEditingNotesId] = useState<number | null>(null);
  const [notesValue,    setNotesValue]    = useState("");
  const notesInputRef = useRef<HTMLTextAreaElement>(null);

  // ── Search state ────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isSearching = searchQuery.trim().length > 0;

  const allSearchResults = useMemo(
    () => searchItems(searchQuery, allItems, outfits ?? []),
    [searchQuery, allItems, outfits],
  );
  const itemResults  = allSearchResults.filter((r): r is SearchResultItem  => r.kind === "item");
  const groupResults = allSearchResults.filter((r): r is SearchResultGroup => r.kind === "group");

  // Scroll to top the instant searching starts
  useEffect(() => {
    if (isSearching) window.scrollTo({ top: 0 });
  }, [isSearching]);

  useEffect(() => {
    if (renamingId !== null) renameInputRef.current?.focus();
  }, [renamingId]);

  useEffect(() => {
    if (editingNotesId !== null) notesInputRef.current?.focus();
  }, [editingNotesId]);

  // Jump to an outfit card after clearing the search
  const jumpToOutfit = useCallback((id: number) => {
    setSearchQuery("");
    setTimeout(() => {
      document.getElementById(`outfit-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }, []);

  const startRename = (id: number, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const commitRename = (id: number) => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== outfits?.find((o) => o.id === id)?.name) {
      renameOutfit.mutate(
        { id, data: { name: trimmed } },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) }
      );
    }
    setRenamingId(null);
  };

  const startEditNotes = (id: number, currentNotes: string | null | undefined) => {
    setEditingNotesId(id);
    setNotesValue(currentNotes ?? "");
  };

  const commitNotes = (id: number) => {
    const trimmed = notesValue.trim();
    const current = outfits?.find((o) => o.id === id)?.notes ?? "";
    if (trimmed !== (current ?? "")) {
      renameOutfit.mutate(
        { id, data: { notes: trimmed || null } },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) }
      );
    }
    setEditingNotesId(null);
  };

  const isFree       = tier === "free";
  const outfitCount  = outfits?.length ?? 0;
  const atLimit      = isFree && outfitCount >= FREE_OUTFIT_LIMIT;

  const handleDelete = (id: number) => {
    deleteOutfit.mutate(
      { id },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) }
    );
  };

  const handleRemoveItem = (outfitId: number, itemId: number) => {
    removeItemFromOutfit.mutate(
      { id: outfitId, itemId },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) }
    );
  };

  const handlePickedItem = (item: ClothingItem) => {
    if (replacingSlot == null) return;
    addItemToOutfit.mutate(
      { id: replacingSlot.outfitId, data: { itemId: item.id } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) }
    );
    setReplacingSlot(null);
  };

  const handlePickedExtra = (item: ClothingItem) => {
    if (addingExtra == null) return;
    addItemToOutfit.mutate(
      { id: addingExtra, data: { itemId: item.id } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) }
    );
    setAddingExtra(null);
  };

  return (
    <div className="min-h-full flex flex-col pt-8 px-4 pb-8 bg-secondary/10 relative">
      <header className="mb-4">
        <h1 className="text-4xl font-display font-bold uppercase tracking-tighter mb-1">Lookbook</h1>
        <div className="flex items-center justify-between">
          <p className="font-medium text-muted-foreground text-sm">Hall of fame.</p>

          {isFree && outfitCount > 0 && (
            <button
              onClick={() => setShowUpgrade(true)}
              className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full
                          border-2 transition-colors
                          ${atLimit
                            ? "bg-black text-white border-black"
                            : outfitCount >= FREE_OUTFIT_LIMIT - 1
                            ? "bg-primary border-black text-black"
                            : "bg-white border-black/20 text-black/40 hover:border-black/40"
                          }`}
            >
              {outfitCount}/{FREE_OUTFIT_LIMIT} saved
            </button>
          )}
        </div>

        {/* Search bar */}
        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/35 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, category, or notes..."
            className="w-full pl-9 pr-9 py-2.5 rounded-2xl border-2 border-black/15 bg-white
                       text-sm font-medium placeholder:text-black/30 placeholder:font-normal
                       focus:outline-none focus:border-black/40 transition-colors"
          />
          {isSearching && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center
                         rounded-full bg-black/10 hover:bg-black/20 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </header>

      {atLimit && !isLoading && !isSearching && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 border-2 border-black rounded-xl bg-primary p-4
                     shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
        >
          <p className="font-display font-bold text-sm uppercase tracking-tight">
            🔓 Lookbook is full
          </p>
          <p className="text-xs text-black/60 mt-1 mb-3 leading-snug">
            You've saved {FREE_OUTFIT_LIMIT} looks — the free limit.
            Unlock Forever to save unlimited cases.
          </p>
          <button
            onClick={() => setShowUpgrade(true)}
            className="w-full py-2.5 rounded-lg border-2 border-black bg-black text-white
                       font-bold uppercase text-xs tracking-wide
                       shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]
                       active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
          >
            Unlock Forever – $4.99
          </button>
        </motion.div>
      )}

      {/* ── Search results ────────────────────────────────────────────────── */}
      {isSearching ? (
        <div className="flex flex-col gap-4">
          {allSearchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-8
                            bg-white border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <Search className="w-8 h-8 text-black/20 mb-3" />
              <p className="text-sm font-bold text-black/40">No results for "{searchQuery}"</p>
            </div>
          ) : (
            <>
              {/* Individual items */}
              {itemResults.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 mb-2">Items</p>
                  <div className="flex flex-col gap-2">
                    {itemResults.map((r) => (
                      <button
                        key={r.item.id}
                        onClick={() => { setDetailsItem(r.item); setDetailsFromSearch(true); }}
                        className="flex items-center gap-3 p-3 bg-white border-2 border-black rounded-xl
                                   shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                                   active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all text-left"
                      >
                        <Thumb item={r.item} size={48} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{r.item.name}</p>
                          <p className="text-[11px] text-black/45 font-medium uppercase tracking-wide mt-0.5">
                            {r.item.category}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-black/25 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Groups */}
              {groupResults.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 mb-2">
                    Lookbook Groups
                  </p>
                  <div className="flex flex-col gap-2">
                    {groupResults.map((r) => (
                      <button
                        key={r.outfit.id}
                        onClick={() => jumpToOutfit(r.outfit.id)}
                        className="flex items-center gap-3 p-3 bg-white border-2 border-black rounded-xl
                                   shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                                   active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all text-left"
                      >
                        <div className="flex gap-1 flex-shrink-0">
                          {Array.from({ length: 3 }).map((_, i) => (
                            <Thumb key={i} item={r.outfit.items?.[i]} size={44} />
                          ))}
                        </div>
                        <p className="flex-1 text-sm font-bold truncate min-w-0">{r.outfit.name}</p>
                        <ChevronRight className="w-4 h-4 text-black/25 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : isLoading ? (
        /* ── Loading skeleton ─────────────────────────────────────────────── */
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-52 bg-muted animate-pulse border-2 border-black rounded-xl" />
          ))}
        </div>
      ) : outfits && outfits.length > 0 ? (
        /* ── Normal outfit list ───────────────────────────────────────────── */
        <div className="flex flex-col gap-6">
          {outfits.map((outfit) => {
            const bySlot = (outfit.items ?? []).reduce<Partial<Record<SlotKey, ClothingItem>>>(
              (acc, item) => {
                const key = item.category as SlotKey;
                if (SLOT_ORDER.includes(key) && !acc[key]) acc[key] = item;
                return acc;
              },
              {}
            );
            const knownIds = new Set(Object.values(bySlot).map((i) => i?.id));
            const extras   = (outfit.items ?? []).filter((i) => !knownIds.has(i.id));

            return (
              <motion.div
                key={outfit.id}
                id={`outfit-${outfit.id}`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-xl overflow-hidden"
                data-testid={`outfit-card-${outfit.id}`}
              >
                {/* Card header */}
                <div className="px-4 py-3 border-b-2 border-black flex justify-between items-center bg-[#243B24] gap-2">
                  {renamingId === outfit.id ? (
                    <form
                      className="flex-1 flex items-center gap-1"
                      onSubmit={(e) => { e.preventDefault(); commitRename(outfit.id); }}
                    >
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(outfit.id)}
                        maxLength={60}
                        className="flex-1 font-display font-bold text-lg uppercase tracking-tight bg-white/60 border-2 border-black rounded-lg px-2 py-0.5 outline-none min-w-0"
                      />
                      <button type="submit" className="w-7 h-7 flex items-center justify-center bg-white border-2 border-black rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => startRename(outfit.id, outfit.name)}
                      className="flex-1 flex items-center gap-1.5 text-left group min-w-0"
                    >
                      <h3 className="font-display font-bold text-lg uppercase tracking-tight truncate text-white">{outfit.name}</h3>
                      <Pencil className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-50 transition-opacity" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(outfit.id)}
                    className="w-8 h-8 flex items-center justify-center bg-white border-2 border-black rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:translate-x-0.5 active:shadow-none hover:bg-destructive/10 transition-colors shrink-0"
                    data-testid={`button-delete-outfit-${outfit.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Notes */}
                <div className="px-4 py-2 border-b border-black/10">
                  {editingNotesId === outfit.id ? (
                    <form onSubmit={(e) => { e.preventDefault(); commitNotes(outfit.id); }} className="flex gap-2">
                      <textarea
                        ref={notesInputRef}
                        value={notesValue}
                        onChange={(e) => setNotesValue(e.target.value)}
                        onBlur={() => commitNotes(outfit.id)}
                        rows={2}
                        maxLength={300}
                        placeholder="Add notes…"
                        className="flex-1 text-xs border-2 border-black rounded-lg px-2 py-1.5 resize-none outline-none focus:ring-2 focus:ring-primary bg-white"
                      />
                      <button type="submit" className="self-start w-7 h-7 flex items-center justify-center bg-black text-white border-2 border-black rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => startEditNotes(outfit.id, outfit.notes)}
                      className="w-full text-left group"
                    >
                      {outfit.notes ? (
                        <p className="text-xs text-black/60 leading-snug flex items-start gap-1">
                          <span className="flex-1">{outfit.notes}</span>
                          <Pencil className="w-3 h-3 shrink-0 mt-0.5 opacity-0 group-hover:opacity-40 transition-opacity" />
                        </p>
                      ) : (
                        <p className="text-xs text-black/25 italic">Add notes…</p>
                      )}
                    </button>
                  )}
                </div>

                {/* 4-slot grid */}
                <div className="p-3">
                  <div className="grid grid-cols-4 gap-2">
                    {SLOT_ORDER.map((slot) => {
                      const item = bySlot[slot];
                      return (
                        <div key={slot} className="flex flex-col gap-0.5">
                          {item ? (
                            <>
                              <ItemPhoto item={item} size="lg" onClick={() => { setDetailsItem(item); setDetailsFromSearch(false); }} />
                              <div className="flex items-center justify-between px-0.5">
                                <span className="text-[8px] font-bold uppercase text-muted-foreground truncate">
                                  {SLOT_LABELS[slot]}
                                </span>
                                <button
                                  onClick={() => handleRemoveItem(outfit.id, item.id)}
                                  className="w-3.5 h-3.5 flex items-center justify-center rounded-full bg-black/10 hover:bg-red-100 transition-colors flex-shrink-0"
                                >
                                  <X className="w-2.5 h-2.5 text-black/50" />
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => setReplacingSlot({ outfitId: outfit.id, category: slot })}
                                className="h-28 w-full border-2 border-dashed border-black/25 rounded flex flex-col items-center justify-center gap-1 hover:border-black/50 hover:bg-black/5 transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5 text-black/30" />
                              </button>
                              <span className="text-[8px] font-bold uppercase text-black/25 text-center truncate">
                                {SLOT_LABELS[slot]}
                              </span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Extras */}
                  <div className="mt-3 pt-3 border-t border-black/10">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-black/30 mb-2">Extras</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {Array.from({ length: 10 }).map((_, i) => {
                        const item = extras[i];
                        return item ? (
                          <div key={item.id} className="relative flex flex-col gap-0.5">
                            <button
                              onClick={() => { setDetailsItem(item); setDetailsFromSearch(false); }}
                              className="w-full aspect-square border-2 border-black overflow-hidden rounded"
                              style={{ background: "#F5EDD8" }}
                            >
                              {item.imageObjectPath ? (
                                <img src={getImageUrl(item.imageObjectPath)!} alt={item.name} className="w-full h-full object-contain" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <span className="text-[8px] font-bold text-black/30">—</span>
                                </div>
                              )}
                            </button>
                            {item.isFavorite && (
                              <span className="absolute top-0 left-0 text-[10px] leading-none z-20 pointer-events-none">⭐</span>
                            )}
                            <button
                              onClick={() => handleRemoveItem(outfit.id, item.id)}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-white border border-black rounded-full flex items-center justify-center shadow-sm z-10"
                            >
                              <X className="w-2 h-2" />
                            </button>
                          </div>
                        ) : (
                          <button
                            key={`empty-${i}`}
                            onClick={() => setAddingExtra(outfit.id)}
                            className="aspect-square border-2 border-dashed border-black/25 rounded flex items-center justify-center hover:border-black/50 hover:bg-black/5 transition-colors"
                          >
                            <Plus className="w-3 h-3 text-black/25" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-3 pb-3">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wide">
                    {outfit.items?.length ?? 0} product{(outfit.items?.length ?? 0) !== 1 ? "s" : ""}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-xl mt-8">
          <div className="w-14 h-14 bg-accent rounded-full flex items-center justify-center border-2 border-black mb-4">
            <Bookmark className="w-7 h-7" />
          </div>
          <h3 className="font-display font-bold text-xl mb-2">No looks saved yet.</h3>
          <p className="text-sm font-medium text-muted-foreground">
            Head to your Garden, spin the slots, and save looks you love.
          </p>
        </div>
      )}

      {/* Upgrade sheet */}
      <AnimatePresence>
        {showUpgrade && (
          <UpgradeSheet reason="outfits" onClose={() => setShowUpgrade(false)} />
        )}
      </AnimatePresence>

      {/* Garden picker for replacing a slot */}
      <AnimatePresence>
        {replacingSlot !== null && (
          <WardrobePickerSheet
            key={`${replacingSlot.outfitId}-${replacingSlot.category}`}
            open
            onOpenChange={(open) => { if (!open) setReplacingSlot(null); }}
            category={replacingSlot.category}
            existingItemIds={
              outfits?.find((o) => o.id === replacingSlot.outfitId)?.items?.map((i) => i.id) ?? []
            }
            onPick={handlePickedItem}
          />
        )}
      </AnimatePresence>

      {/* All-category picker for extras */}
      <AnimatePresence>
        {addingExtra !== null && (
          <WardrobePickerSheet
            key={`extra-${addingExtra}`}
            open
            onOpenChange={(open) => { if (!open) setAddingExtra(null); }}
            existingItemIds={
              outfits?.find((o) => o.id === addingExtra)?.items?.map((i) => i.id) ?? []
            }
            onPick={handlePickedExtra}
          />
        )}
      </AnimatePresence>

      {/* Item details sheet */}
      <AnimatePresence>
        {detailsItem && (
          <ItemDetailsSheet
            key={detailsItem.id}
            item={detailsItem}
            onClose={() => setDetailsItem(null)}
            showAddToLookbook={detailsFromSearch}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
