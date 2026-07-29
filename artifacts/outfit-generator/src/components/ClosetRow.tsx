/**
 * ClosetRow — fixed 3-slot carousel for the wardrobe closet view.
 *
 * Positioned by wardrobe.tsx starting at lm.hangerBot so photos appear directly
 * below the hanger arms (TOPS/BOTTOMS) or at lm.boxY for SHOES (shelf display).
 * The component renders no hanger — background image provides the hanger graphics;
 * a z=20 overlay in wardrobe.tsx re-draws them on top of the clothing cards.
 *
 * • Divides width into 3 equal slots: left | center | right.
 * • Photos are inset ~8% within each slot (photoW = slotW * 0.92, 3:4 portrait).
 *   Inset is applied as horizontal centering (GAP/2 each side) + marginTop (top gap).
 *   Bottom spacing is implicitly provided by row container overflow clipping.
 * • Center item: thin soft-pink border (#F7C6D8, 1.5 px). Left/right: borderless.
 * • Primary selection cue: the pink center hanger baked into the background image.
 * • Swipe gesture translates the strip; release snaps to the nearest item.
 * • Empty slots are transparent — background image shows through.
 *
 * Handle (forwardRef): scrollToIndex(i, smooth?)
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

// ── Cover Flow visual constants ───────────────────────────────────────────────
const SCALE_CTR   = 1.05;            // center card is 5% larger
const SCALE_SIDE  = 0.88;            // side cards are 88% of center
const OPACITY_SIDE = 0.72;           // side cards fade to 72%
const BG_CENTER   = "rgba(178,148,95,1.0)";    // warm brown card — matches welcome button tone
const SHADOW_CTR  = "0 4px 18px rgba(0,0,0,0.40), 0 1px 4px rgba(0,0,0,0.20)";
import { type ClothingItem } from "@/hooks/useLocalDB";
import { getImageUrl } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ClosetRowHandle {
  scrollToIndex: (index: number, smooth?: boolean) => void;
  getLength: () => number;
}

interface ClosetRowProps {
  items: ClothingItem[];
  onCenteredItem: (item: ClothingItem | null) => void;
  onItemTap?: (item: ClothingItem) => void;
  /** Hard ceiling on photo height in px — set by the parent so all rows
   *  show cards at the same size regardless of available row height. */
  maxPhotoH?: number;
  /** When true, swipe gestures are disabled (used on Generate page). */
  disableSwipe?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────
export const ClosetRow = forwardRef<ClosetRowHandle, ClosetRowProps>(
  ({ items, onCenteredItem, onItemTap, maxPhotoH, disableSwipe = false }, ref) => {

    // ── Container measurement ─────────────────────────────────────────────────
    const containerRef = useRef<HTMLDivElement>(null);
    const [slotW,      setSlotW]    = useState(0);
    const [containerH, setContH]   = useState(0);

    useLayoutEffect(() => {
      const measure = () => {
        const el = containerRef.current;
        if (!el) return;
        setSlotW(el.clientWidth / 3);
        setContH(el.clientHeight);
      };
      measure();
      const ro = new ResizeObserver(measure);
      if (containerRef.current) ro.observe(containerRef.current);
      return () => ro.disconnect();
    }, []);

    // ── Carousel state ─────────────────────────────────────────────────────────
    const [centredIdx,    setCentredIdx]  = useState(0);
    const [dragX,         setDragX]       = useState(0);
    const [transitioning, setTransition]  = useState(false);

    // Refs so callbacks capture stable references
    const dragStartX   = useRef(0);
    const isDragging   = useRef(false);
    // hasDragged is set true once the pointer has moved far enough during a drag;
    // used to suppress the synthetic click that fires after pointerup.
    const hasDragged   = useRef(false);
    // Track last notified item *identity* so parent is updated on both index AND
    // content changes (e.g. item replaced at the same position).
    const lastNotifiedId = useRef<number | null>(null);

    // Track previous length so we can detect additions vs deletions
    const prevLengthRef = useRef(items.length);

    useEffect(() => {
      const prev = prevLengthRef.current;
      prevLengthRef.current = items.length;

      if (items.length === 0) return;

      if (items.length > prev) {
        // New item uploaded — jump to index 0 (newest item, desc-sorted)
        setCentredIdx(0);
        setDragX(0);
      } else {
        // Deletion: clamp so index stays valid
        setCentredIdx(i => Math.max(0, Math.min(items.length - 1, i)));
      }
    }, [items.length]);

    // Notify parent whenever the centered item's identity changes
    useEffect(() => {
      if (items.length === 0) {
        if (lastNotifiedId.current !== null) {
          lastNotifiedId.current = null;
          onCenteredItem(null);
        }
        return;
      }
      const clamped = Math.max(0, Math.min(items.length - 1, centredIdx));
      const item    = items[clamped];
      if (item && item.id !== lastNotifiedId.current) {
        lastNotifiedId.current = item.id;
        onCenteredItem(item);
      }
    });   // intentionally runs every render — the id-gate is the dedup

    // ── Imperative handle ─────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      scrollToIndex: (index, smooth = true) => {
        const clamped = Math.max(0, Math.min(items.length - 1, index));
        if (smooth) {
          setTransition(true);
          setCentredIdx(clamped);
          setTimeout(() => setTransition(false), 320);
        } else {
          setTransition(false);
          setCentredIdx(clamped);
        }
      },
      getLength: () => items.length,
    }), [items.length]);

    // ── Pointer events ────────────────────────────────────────────────────────
    const onPointerDown = useCallback((e: React.PointerEvent) => {
      if (disableSwipe) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStartX.current = e.clientX;
      isDragging.current = true;
      hasDragged.current = false;
      setTransition(false);
    }, [disableSwipe]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
      if (disableSwipe || !isDragging.current) return;
      const dx = e.clientX - dragStartX.current;
      if (!hasDragged.current && Math.abs(dx) > 6) hasDragged.current = true;
      setDragX(dx);
    }, [disableSwipe]);

    const onPointerUp = useCallback((e: React.PointerEvent) => {
      if (disableSwipe || !isDragging.current) return;
      isDragging.current = false;
      const dx    = e.clientX - dragStartX.current;
      const moved = hasDragged.current;
      setTransition(true);
      setDragX(0);
      if (moved && slotW > 0) {
        const THRESH = slotW * 0.20;
        if (dx < -THRESH) {
          setCentredIdx(i => Math.min(items.length - 1, i + 1));
        } else if (dx > THRESH) {
          setCentredIdx(i => Math.max(0, i - 1));
        }
      }
      setTimeout(() => setTransition(false), 320);
    }, [disableSwipe, slotW, items.length]);

    // ── Item tap (center → open details; side → re-center) ───────────────────
    const onItemActivate = useCallback((item: ClothingItem, idx: number) => {
      // hasDragged is a ref; if the pointer moved significantly, suppress the click
      if (hasDragged.current) return;
      if (idx === centredIdx) {
        onItemTap?.(item);
      } else {
        setTransition(true);
        setCentredIdx(idx);
        setTimeout(() => setTransition(false), 320);
      }
    }, [centredIdx, onItemTap]);

    // ── Geometry ──────────────────────────────────────────────────────────────
    const baseX  = (1 - centredIdx) * slotW;
    const stripX = baseX + dragX;
    const containerCX = slotW * 1.5; // visual center of the 3-slot viewport

    // Items beyond ±1.65 slots from center are culled
    const isVisible = (i: number) => {
      const itemCX = i * slotW + slotW / 2 + stripX;
      return Math.abs(itemCX - containerCX) / slotW <= 1.65;
    };

    const lo = Math.max(0, centredIdx - 2);
    const hi = Math.min(items.length - 1, centredIdx + 2);

    // ── Card base geometry ────────────────────────────────────────────────────
    // Side-item card dimensions (SCALE_SIDE = 1).  Center card is scaled up
    // via CSS transform so layout is unaffected.
    const GAP    = slotW * 0.06;
    const photoW = slotW - GAP;
    const photoH = Math.min(photoW * 1.1, maxPhotoH ?? (containerH - 2));

    // CSS transition applied to individual card properties during snap animation.
    // During live drag we compute live values so no card-level transition is needed.
    const CARD_TRANSITION =
      "transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94), " +
      "opacity 0.28s ease, " +
      "box-shadow 0.28s ease, " +
      "background-color 0.28s ease";

    // Don't render until we've measured the container
    if (!slotW || !containerH) {
      return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
    }

    return (
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: "absolute",
          inset: 0,
          // overflow visible so the scaled-up center card isn't clipped at edges
          overflow: "visible",
          touchAction: "pan-y",
          userSelect: "none",
          cursor: items.length > 1 ? "ew-resize" : "default",
        }}
      >
        {/* Strip — all (visible-range) items side by side */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: items.length * slotW,
            height: "100%",
            transform: `translateX(${stripX}px)`,
            transition: transitioning
              ? "transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)"
              : "none",
            willChange: "transform",
          }}
        >
          {items.slice(lo, hi + 1).map((item, localIdx) => {
            const i        = lo + localIdx;
            if (!isVisible(i)) return null;
            const isCenter = i === centredIdx;

            // ── Cover Flow per-card style ──────────────────────────────────────
            // During a live drag React re-renders on every pointer-move, so we
            // can compute the exact visual state from the real pixel position.
            // During the snap animation (transitioning=true) the strip moves via
            // CSS, React doesn't re-render per-frame, so we fall back to discrete
            // center/side values and let CARD_TRANSITION do the blend.
            let scale:   number;
            let opacity: number;
            let bg:      string;
            let shadow:  string;

            if (transitioning) {
              // Discrete snap state — CSS transition interpolates the rest
              scale   = isCenter ? SCALE_CTR  : SCALE_SIDE;
              opacity = isCenter ? 1          : OPACITY_SIDE;
              bg      = isCenter ? BG_CENTER  : "transparent";
              shadow  = isCenter ? SHADOW_CTR : "none";
            } else {
              // Live drag — smooth per-frame interpolation based on actual px position
              const itemCX    = i * slotW + slotW / 2 + stripX;
              const distSlots = Math.abs(itemCX - containerCX) / slotW;
              // progress: 1 when perfectly centred, 0 when one full slot away
              const p = Math.max(0, Math.min(1, 1 - distSlots));
              scale   = SCALE_SIDE  + (SCALE_CTR   - SCALE_SIDE)   * p;
              opacity = OPACITY_SIDE + (1           - OPACITY_SIDE) * p;
              bg      = `rgba(178,148,95,${p.toFixed(3)})`;
              shadow  = p > 0.05
                ? `0 ${(4 * p).toFixed(1)}px ${(16 * p).toFixed(1)}px rgba(200,100,120,${(0.22 * p).toFixed(3)})`
                : "none";
            }

            return (
              <button
                key={item.id}
                onClick={() => onItemActivate(item, i)}
                aria-label={isCenter
                  ? `${item.name ?? "Item"} — selected. Tap to view details.`
                  : `${item.name ?? "Item"} — tap to select`}
                aria-pressed={isCenter}
                style={{
                  position: "absolute",
                  top: 0,
                  left: i * slotW,
                  width: slotW,
                  height: "100%",
                  cursor: isCenter ? "pointer" : "ew-resize",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  WebkitTapHighlightColor: "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  // z-index so the scaled-up center card renders above its neighbours
                  zIndex: isCenter ? 2 : 1,
                }}
              >
                {/* Photo card — scales, fades, and recolours as it moves
                    to/from centre.  transform-origin centre keeps the card
                    visually anchored in its slot. */}
                <div
                  style={{
                    width: photoW,
                    height: photoH,
                    flexShrink: 0,
                    overflow: "hidden",
                    borderRadius: "12px",
                    background: bg,
                    boxShadow: shadow,
                    position: "relative",
                    pointerEvents: "none",
                    opacity,
                    transform: `scale(${scale.toFixed(4)})`,
                    transformOrigin: "center center",
                    transition: transitioning ? CARD_TRANSITION : "none",
                    willChange: "transform, opacity",
                  }}
                >
                  {item.imageObjectPath ? (
                    <img
                      src={getImageUrl(item.imageObjectPath)!}
                      alt={item.name ?? ""}
                      draggable={false}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        objectPosition: "center",
                        display: "block",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.3rem",
                        opacity: 0.5,
                      }}
                    >
                      {item.name?.slice(0, 2) ?? "👗"}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
);

ClosetRow.displayName = "ClosetRow";
