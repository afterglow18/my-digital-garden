import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Plus } from "lucide-react";
import { ClothingItem } from "@workspace/api-client-react";
import { getImageUrl } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────
export const ITEM_W   = 120; // px — card width
export const ITEM_H   = 148; // px — card height
export const ITEM_GAP =  12; // px — gap between cards

// ── Public handle ─────────────────────────────────────────────────────────────
export interface SwipeRowHandle {
  scrollToIndex: (index: number, smooth?: boolean) => void;
  getLength: () => number;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface SwipeRowProps {
  items: ClothingItem[];
  addLabel: string;
  onCenteredItem: (item: ClothingItem | null) => void;
  onAddClick: () => void;
  /** Called when the currently-centred card is tapped (opens Item Details) */
  onItemTap?: (item: ClothingItem) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export const SwipeRow = forwardRef<SwipeRowHandle, SwipeRowProps>(
  ({ items, addLabel, onCenteredItem, onAddClick, onItemTap }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const itemRefs     = useRef<(HTMLDivElement | null)[]>([]);
    const lastSnapIdx  = useRef(-1);
    const STEP = ITEM_W + ITEM_GAP;

    // Track centred index in state — only for rendering the info button
    const [centredIdx, setCentredIdx] = useState(0);

    // ── Imperative API ────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      scrollToIndex: (index, smooth = true) => {
        containerRef.current?.scrollTo({
          left: index * STEP,
          behavior: smooth ? "smooth" : "instant",
        });
      },
      getLength: () => items.length,
    }));

    // ── Visual update — runs directly on DOM for buttery scroll ───────────────
    const updateVisuals = useCallback(() => {
      const el = containerRef.current;
      if (!el || items.length === 0) return;

      const raw     = el.scrollLeft / STEP;
      const snapIdx = Math.max(0, Math.min(items.length - 1, Math.round(raw)));

      itemRefs.current.forEach((node, i) => {
        if (!node) return;
        const dist    = Math.abs(i - raw);
        const clamped = Math.min(dist, 1);
        node.style.transform = `scale(${(1 - clamped * 0.14).toFixed(3)})`;
        node.style.opacity   = (1 - clamped * 0.60).toFixed(3);
      });

      if (snapIdx !== lastSnapIdx.current) {
        lastSnapIdx.current = snapIdx;
        setCentredIdx(snapIdx);
        onCenteredItem(items[snapIdx] ?? null);
      }
    }, [items, onCenteredItem, STEP]);

    useEffect(() => {
      updateVisuals();
      if (items.length > 0 && lastSnapIdx.current === -1) {
        onCenteredItem(items[0]);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items.length]);

    // ── Card click: centre-then-open pattern ─────────────────────────────────
    const handleCardClick = useCallback(
      (item: ClothingItem, idx: number) => {
        if (idx === lastSnapIdx.current) {
          // Already centred → open details
          onItemTap?.(item);
        } else {
          // Not centred → scroll to centre (user taps again for details)
          containerRef.current?.scrollTo({ left: idx * STEP, behavior: "smooth" });
        }
      },
      [onItemTap, STEP]
    );

    // ── Empty row ─────────────────────────────────────────────────────────────
    if (items.length === 0) {
      return (
        <div className="flex justify-center items-center" style={{ height: ITEM_H + 20 }}>
          <button
            onClick={onAddClick}
            className="border-2 border-dashed border-black/35 rounded-2xl
                       flex flex-col items-center justify-center gap-2
                       bg-white/60 hover:border-black hover:bg-white transition-all active:scale-95"
            style={{ width: ITEM_W, height: ITEM_H }}
          >
            <div className="w-9 h-9 rounded-full border-2 border-black/35 flex items-center justify-center">
              <Plus className="w-5 h-5 text-black/45" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wide text-black/45 text-center px-2 leading-tight">
              {addLabel}
            </span>
          </button>
        </div>
      );
    }

    // ── Scroll row ────────────────────────────────────────────────────────────
    return (
      <div className="relative" style={{ height: ITEM_H + 20 }}>
        {/* Centre viewfinder */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                     pointer-events-none z-10 rounded-2xl"
          style={{
            width:     ITEM_W + 6,
            height:    ITEM_H + 6,
            boxShadow: "0 0 0 2.5px black, 0 4px 0 0 black",
          }}
        />

        {/* Scrollable strip */}
        <div
          ref={containerRef}
          onScroll={updateVisuals}
          className="flex items-center h-full overflow-x-auto no-scrollbar"
          style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}
        >
          <div className="flex-none shrink-0" style={{ width: `calc(50% - ${ITEM_W / 2}px)` }} />

          {items.map((item, i) => (
            <div
              key={item.id}
              ref={(el) => { itemRefs.current[i] = el; }}
              onClick={() => handleCardClick(item, i)}
              className="flex-none flex flex-col rounded-2xl overflow-hidden
                         bg-white border-2 border-black cursor-pointer relative"
              style={{
                width:           ITEM_W,
                height:          ITEM_H,
                marginLeft:      i === 0 ? 0 : ITEM_GAP,
                scrollSnapAlign: "center",
                willChange:      "transform, opacity",
                transform:       "scale(1)",
                opacity:         i === 0 ? "1" : "0.4",
              }}
            >
              {/* Photo */}
              <div className="flex-1 bg-muted overflow-hidden relative"
                   style={{
                     backgroundImage: item.imageObjectPath
                       ? undefined
                       : undefined,
                     // checkerboard for transparent PNGs
                     backgroundSize: "10px 10px",
                   }}>
                {item.imageObjectPath ? (
                  <img
                    src={getImageUrl(item.imageObjectPath)!}
                    alt={item.name}
                    className="w-full h-full object-contain"
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full bg-secondary/30 flex items-center justify-center p-2">
                    <span className="font-display font-bold text-center text-[9px] uppercase leading-tight">
                      {item.name}
                    </span>
                  </div>
                )}

                {/* "Tap again for details" hint — only on centred card */}
                {i === centredIdx && (
                  <div className="absolute bottom-1 right-1 w-5 h-5 bg-black/60 rounded-full
                                  flex items-center justify-center pointer-events-none">
                    <span className="text-white text-[8px] font-bold">i</span>
                  </div>
                )}
              </div>

              {/* Name strip */}
              <div className="px-2 py-1.5 border-t-2 border-black bg-white shrink-0">
                <span className="font-bold text-[10px] uppercase tracking-tight line-clamp-1 block">
                  {item.name}
                </span>
              </div>
            </div>
          ))}

          <div className="flex-none shrink-0" style={{ width: `calc(50% - ${ITEM_W / 2}px)` }} />
        </div>
      </div>
    );
  }
);

SwipeRow.displayName = "SwipeRow";
