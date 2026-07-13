/**
 * FavoritesPage ("Totally 💛") — every clothing item the user has hearted.
 * Displays as a 4-column grid with uniform square cards.
 * Items can be dragged to reorder; order is persisted in localStorage.
 * Tap an item to open the full details sheet.
 */
import React, { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Heart } from "lucide-react";
import {
  useListClothing,
  useUpdateClothingItem,
  getListClothingQueryKey,
  ClothingItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getImageUrl } from "@/lib/utils";
import { ItemDetailsSheet } from "@/components/clothing/ItemDetailsSheet";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const CATEGORY_LABELS: Record<string, string> = {
  makeup:     "Makeup",
  skincare:   "Skincare",
  hair:       "Haircare",
  fragrances: "Fragrance",
};

const ORDER_KEY = "closet-favorites-order";

function getSavedOrder(): number[] {
  try { return JSON.parse(localStorage.getItem(ORDER_KEY) ?? "[]"); } catch { return []; }
}
function saveOrder(ids: number[]) {
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(ids)); } catch {}
}
function applyOrder(items: ClothingItem[], order: number[]): ClothingItem[] {
  if (!order.length) return items;
  const map = new Map(items.map((i) => [i.id, i]));
  const ordered = order.map((id) => map.get(id)).filter(Boolean) as ClothingItem[];
  const rest = items.filter((i) => !order.includes(i.id));
  return [...ordered, ...rest];
}

// ── Sortable tile ─────────────────────────────────────────────────────────────

function SortableTile({
  item,
  onTap,
}: {
  item: ClothingItem;
  onTap: (item: ClothingItem) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: "relative",
  };

  return (
    <div ref={setNodeRef} style={style}>
      {/* Drag + tap target — whole tile */}
      <button
        {...attributes}
        {...listeners}
        onClick={() => onTap(item)}
        className="w-full aspect-square border-2 border-black rounded-xl overflow-hidden
                   shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                   active:shadow-none active:translate-x-0.5 active:translate-y-0.5
                   transition-all touch-none"
        style={{ background: "#FDECEF", display: "block", padding: 0, cursor: "grab" }}
      >
        {item.imageObjectPath ? (
          <img
            src={getImageUrl(item.imageObjectPath)!}
            alt={item.name}
            className="w-full h-full"
            style={{ objectFit: "cover", objectPosition: "center", pointerEvents: "none" }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-2xl opacity-30">
              {item.category === "shoes" ? "👟"
                : item.category === "dresses" ? "👗"
                : item.category === "accessories" ? "👜"
                : "👚"}
            </span>
          </div>
        )}
      </button>

      {/* Category label */}
      <p className="mt-1 text-[9px] font-bold uppercase text-center text-muted-foreground tracking-wide truncate">
        {item.name || CATEGORY_LABELS[item.category ?? ""] || "—"}
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FavoritesPage() {
  // Fetch all items in one query (no category filter) so nothing is missed
  const { data: allItems = [], isLoading } = useListClothing({});

  const rawFavorites = allItems.filter((item) => item.isFavorite);

  const [orderedIds, setOrderedIds] = useState<number[]>([]);
  const [detailsItem, setDetailsItem] = useState<ClothingItem | null>(null);

  useEffect(() => { setOrderedIds(getSavedOrder()); }, []);

  const favorites = applyOrder(rawFavorites, orderedIds);

  const updateItem  = useUpdateClothingItem();
  const queryClient = useQueryClient();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrderedIds(() => {
      const ids = favorites.map((i) => i.id);
      const oldIndex = ids.indexOf(active.id as number);
      const newIndex = ids.indexOf(over.id as number);
      if (oldIndex === -1 || newIndex === -1) return ids;
      const next = arrayMove(ids, oldIndex, newIndex);
      saveOrder(next);
      return next;
    });
  };

  const handleDetailsClose = () => {
    // Refresh in case isFavorite changed inside the sheet
    queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
    setDetailsItem(null);
  };

  return (
    <div className="min-h-full flex flex-col pt-8 px-4 pb-8 bg-secondary/10">

      <header className="mb-5">
        <h1 className="text-4xl font-display font-bold uppercase tracking-tighter mb-1">
          My Faves 💕
        </h1>
        <p className="font-medium text-muted-foreground text-sm">
          Saved items. Hold &amp; drag to reorder.
        </p>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-4 gap-3">
          {[1,2,3,4,5,6,7,8].map((i) => (
            <div key={i} className="aspect-square bg-muted animate-pulse border-2 border-black rounded-xl" />
          ))}
        </div>
      ) : favorites.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={favorites.map((i) => i.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-4 gap-3">
              {favorites.map((item) => (
                <SortableTile key={item.id} item={item} onTap={setDetailsItem} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8
                        bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
                        rounded-xl mt-8">
          <div className="w-14 h-14 bg-accent rounded-full flex items-center justify-center border-2 border-black mb-4">
            <Heart className="w-7 h-7" />
          </div>
          <h3 className="font-display font-bold text-xl mb-2">No faves yet.</h3>
          <p className="text-sm font-medium text-muted-foreground">
            Tap any item in your suitcase, then tap the ❤️ to save it here.
          </p>
        </div>
      )}

      {/* Item details sheet */}
      <AnimatePresence>
        {detailsItem && (
          <ItemDetailsSheet
            key={detailsItem.id}
            item={detailsItem}
            onClose={handleDetailsClose}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
