/**
 * WardrobePage — closet-bg.png (941×1672 PNG)
 *
 * Sizing: object-fit CONTAIN inside min(calc(100dvh − 90px), calc(100vw × H/W)).
 *   Image ratio 0.5629 — taller than iPhone portrait ratio (≈0.517) → fills width.
 *   min() clamps container to image aspect ratio so image fills exactly — no letterbox.
 *   Container background #F0C030 (door yellow) blends with yellow doors on sides.
 *
 * Layout (z-index):
 *   0   background <img>
 *   10  ClosetRow carousels — positioned below the rod
 *   12  Transparent "+ ADD" tap zones (visual comes from baked-in background pills)
 *   14  Transparent SAVE OUTFIT / shuffle / mannequin tap zones (visual from rug background)
 *   20  Hanger overlays — thin crop re-rendered at z=20 to keep rod bottom above photos
 *   30+ Modals
 *
 * Hanger overlay technique:
 *   New background has no visible hanging hanger-arm graphics.
 *   A thin overlay (rod-center → rod-bottom, ~5 px) covers the rod bottom edge above photos.
 */

import React, {
  useEffect, useRef, useState,
  useCallback, RefObject,
} from "react";
import { useLocation } from "wouter";
import {
  useListClothing, getListClothingQueryKey,
  useSaveOutfit, useListOutfits, getListOutfitsQueryKey,
  ClothingItem,
} from "@workspace/api-client-react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getImageUrl } from "@/lib/utils";
import { ClosetRow, ClosetRowHandle } from "@/components/ClosetRow";
import { QuickAddSheet } from "@/components/clothing/QuickAddSheet";
import { ItemDetailsSheet } from "@/components/clothing/ItemDetailsSheet";
import { UpgradeSheet, UpgradeReason } from "@/components/paywall/UpgradeSheet";
import { useQueryClient } from "@tanstack/react-query";
import { useEntitlements } from "@/hooks/useEntitlements";
import { FREE_ITEM_LIMIT } from "@/lib/entitlements";

// ── Types ─────────────────────────────────────────────────────────────────────
type RowKey   = "tops" | "bottoms" | "shoes";
type Category = "tops" | "bottoms" | "shoes" | "accessories" | "outerwear" | "dresses";

const ROWS: { key: RowKey; addLabel: string; btnLabel: string }[] = [
  { key: "tops",    addLabel: "Add Top",    btnLabel: "+ ADD TOPS"    },
  { key: "bottoms", addLabel: "Add Bottom", btnLabel: "+ ADD BOTTOMS" },
  { key: "shoes",   addLabel: "Add Shoes",  btnLabel: "+ ADD SHOES"   },
];

// ── Image constants ───────────────────────────────────────────────────────────
const IMG_W = 941;
const IMG_H = 1672;
const NAV_H = 90;

// ── Landmark fractions (measured from the 941×1672 PNG) ──────────────────────
// All x-values are fractions of image WIDTH; y-values of image HEIGHT.
//
// Rod positions sampled at x=150 (left interior, clear of the centre pill):
//   TOPS    rod dark pixels  y=515–528 → centre y≈520  (520/1672=0.311)
//   BOTTOMS rod dark pixels  y=828–840 → centre y≈833  (833/1672=0.498)
//   SHOES   rod dark pixels  y=1148–1160 → centre y≈1153 (1153/1672=0.690)
//
// Door edges sampled at y=600:
//   doorL: yellow→pink transition at x≈87 (87/941=0.092)
//   doorR: pink→yellow transition at x≈848 (848/941=0.901)
//
// Hanger overlay: new background has NO hanging hanger-arm graphics.
//   Each overlay covers only rod-centre → rod-bottom (~8 px) to keep the
//   rod edge crisp above photos.  Zero impact on the clothing photo area.
//
// Save bar: three baked-in circles on the rug (transparent tap zones).
//   Rug/bar starts at y≈1480 (0.885).  Button centres measured from crop.
const LM = {
  // Inner closet edges (just inside the yellow doors)
  doorL: 0.092,   // x≈87  (87/941)
  doorR: 0.901,   // x≈848 (848/941)

  // Per-row landmarks  (btnCY = rod centre, boxY = just below rod bottom)
  rows: [
    {
      btnCY:     0.311, // TOPS rod centre   y≈520  (520/1672)
      boxY:      0.319, // just below rod    y≈533  (533/1672)
      boxBot:    0.495, // just before BOTTOMS rod  y≈828
      hangerTop: 0.311, // thin rod-bottom overlay — rod centre…
      hangerBot: 0.319, // …to rod bottom (no hanger arms in new bg)
    },
    {
      btnCY:     0.498, // BOTTOMS rod centre y≈833  (833/1672)
      boxY:      0.506, // just below rod     y≈846  (846/1672)
      boxBot:    0.685, // just before SHOES rod     y≈1145
      hangerTop: 0.498,
      hangerBot: 0.506,
    },
    {
      btnCY:     0.690, // SHOES rod centre   y≈1153 (1153/1672)
      boxY:      0.697, // just below rod     y≈1165 (1165/1672)
      boxBot:    0.849, // just before floor/rug      y≈1420
      hangerTop: 0.697, // SHOES: no overlay (isShoes guard in JSX)
      hangerBot: 0.697,
    },
  ],

  // SAVE OUTFIT bar — three baked-in circles on the rug
  // Visual from background image; HTML = transparent tap zones only.
  barY:     0.885, // rug/bar top   y≈1480 (1480/1672)
  barBot:   0.993, // bar bottom    y≈1660 (1660/1672)
  hangerCX: 0.175, // left  hanger icon centre x≈165 (165/941)
  saveBtnL: 0.350, // centre button left  edge  x≈329 (329/941)
  saveBtnR: 0.650, // centre button right edge  x≈612 (612/941)
  manneCX:  0.824, // right dress-form centre   x≈775 (775/941)
} as const;

// ── useImageRect ─────────────────────────────────────────────────────────────
interface ImgRect {
  top: number; left: number; width: number; height: number;
  /** Full height of the positioning container (not just the rendered image). */
  containerH: number;
}

function useImageRect(containerRef: RefObject<HTMLDivElement>): ImgRect {
  const [rect, setRect] = useState<ImgRect>({ top: 0, left: 0, width: 0, height: 0, containerH: 0 });
  useEffect(() => {
    const compute = () => {
      const c = containerRef.current;
      if (!c) return;
      const cW = c.clientWidth, cH = c.clientHeight;
      const iR = IMG_W / IMG_H;
      const cR = cW / cH;
      let rW: number, rH: number, rL: number, rT: number;
      if (cR > iR) {
        // Container wider than image: fill height, center horizontally
        rH = cH; rW = cH * iR; rT = 0; rL = (cW - rW) / 2;
      } else {
        // Container taller than image: fill width, anchor top
        rW = cW; rH = cW / iR; rL = 0; rT = 0;
      }
      setRect({ top: rT, left: rL, width: rW, height: rH, containerH: cH });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [containerRef]);
  return rect;
}

// ── Pixel helpers ─────────────────────────────────────────────────────────────
const pH = (ir: ImgRect, f: number) => ir.height * f;
const pW = (ir: ImgRect, f: number) => ir.width  * f;
const pX = (ir: ImgRect, f: number) => ir.left   + ir.width  * f;
const pY = (ir: ImgRect, f: number) => ir.top    + ir.height * f;

const GOLD = "#C49B2A";

// ── Page ──────────────────────────────────────────────────────────────────────
export default function WardrobePage() {
  const containerRef = useRef<HTMLDivElement>(null!);
  const ir = useImageRect(containerRef);

  const rowRefs: Record<RowKey, RefObject<ClosetRowHandle | null>> = {
    tops:    useRef<ClosetRowHandle | null>(null),
    bottoms: useRef<ClosetRowHandle | null>(null),
    shoes:   useRef<ClosetRowHandle | null>(null),
  };

  const [centred,       setCentred]       = useState<Partial<Record<RowKey, ClothingItem>>>({});
  const [addCategory,   setAddCategory]   = useState<Category | null>(null);
  const [detailsItem,   setDetailsItem]   = useState<ClothingItem | null>(null);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | null>(null);
  const [isSaveOpen,    setIsSaveOpen]    = useState(false);
  const [saveName,      setSaveName]      = useState("");

  const { data: tops        = [] } = useListClothing({ category: "tops"        }, { query: { queryKey: getListClothingQueryKey({ category: "tops"        }) } });
  const { data: bottoms     = [] } = useListClothing({ category: "bottoms"     }, { query: { queryKey: getListClothingQueryKey({ category: "bottoms"     }) } });
  const { data: shoes       = [] } = useListClothing({ category: "shoes"       }, { query: { queryKey: getListClothingQueryKey({ category: "shoes"       }) } });
  const { data: accessories = [] } = useListClothing({ category: "accessories" }, { query: { queryKey: getListClothingQueryKey({ category: "accessories" }) } });
  const { data: outfits = [] } = useListOutfits();

  const rowData: Record<RowKey, ClothingItem[]> = { tops, bottoms, shoes };
  const totalItems = tops.length + bottoms.length + shoes.length + accessories.length;

  const saveOutfit  = useSaveOutfit();
  const queryClient = useQueryClient();
  const { tier, caps, canAddItem, canSaveOutfit } = useEntitlements();

  useEffect(() => {
    setCentred(prev => {
      const next = { ...prev };
      let changed = false;
      (["tops", "bottoms", "shoes"] as RowKey[]).forEach(key => {
        if (rowData[key].length === 0 && next[key] !== undefined) {
          delete next[key]; changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [tops.length, bottoms.length, shoes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCentredTops    = useCallback((item: ClothingItem | null) =>
    setCentred(p => ({ ...p, tops:    item ?? undefined })), []);
  const setCentredBottoms = useCallback((item: ClothingItem | null) =>
    setCentred(p => ({ ...p, bottoms: item ?? undefined })), []);
  const setCentredShoes   = useCallback((item: ClothingItem | null) =>
    setCentred(p => ({ ...p, shoes:   item ?? undefined })), []);
  const centredHandlers: Record<RowKey, (item: ClothingItem | null) => void> = {
    tops: setCentredTops, bottoms: setCentredBottoms, shoes: setCentredShoes,
  };

  const handleAddClick   = useCallback((cat: Category) => {
    if (canAddItem(totalItems)) setAddCategory(cat); else setUpgradeReason("items");
  }, [canAddItem, totalItems]);
  const handleAddTops    = useCallback(() => handleAddClick("tops"),    [handleAddClick]);
  const handleAddBottoms = useCallback(() => handleAddClick("bottoms"), [handleAddClick]);
  const handleAddShoes   = useCallback(() => handleAddClick("shoes"),   [handleAddClick]);
  const addHandlers: Record<RowKey, () => void> = {
    tops: handleAddTops, bottoms: handleAddBottoms, shoes: handleAddShoes,
  };

  const handleItemTap = useCallback((item: ClothingItem) => setDetailsItem(item), []);

  const handleSaveClick = useCallback(() => {
    if (canSaveOutfit(outfits.length)) setIsSaveOpen(true); else setUpgradeReason("outfits");
  }, [canSaveOutfit, outfits.length]);

  const handleMannequinClick = useCallback(() => {
    setUpgradeReason("mannequin");
  }, []);

  const [, navigate] = useLocation();

  const handleSave = () => {
    if (!saveName.trim()) return;
    if (!canSaveOutfit(outfits.length)) {
      setIsSaveOpen(false); setSaveName(""); setUpgradeReason("outfits"); return;
    }
    const itemIds = Object.values(centred)
      .filter((i): i is ClothingItem => i != null)
      .map(i => i.id);
    saveOutfit.mutate(
      { data: { name: saveName.trim(), itemIds } },
      { onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
        setIsSaveOpen(false); setSaveName("");
      }},
    );
  };

  const canSave   = ROWS.every(({ key }) => !!centred[key]);
  const isFree    = tier === "free";
  const itemsLeft = isFree ? Math.max(0, FREE_ITEM_LIMIT - totalItems) : null;
  const ready     = ir.width > 0;

  return (
    <div style={{ overflowY: "auto", height: `calc(100dvh - ${NAV_H}px)` }}>
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        // Clamp to image aspect ratio so it fills the container exactly — no
        // letterbox gap below — because the save-bar is baked into the rug at the
        // bottom of the image.  min() prevents overflow on very short screens.
        height: `min(calc(100dvh - ${NAV_H}px), calc(100vw * ${(IMG_H / IMG_W).toFixed(6)}))`,
        flexShrink: 0,
        overflow: "hidden",
        // Door-yellow background blends with yellow doors visible at sides/bottom
        background: "#F0C030",
      }}
    >
      {/* ── Background image — object-fit:contain, never cropped ── */}
      <img
        src="/closet-bg.png"
        alt="My Digital Closet"
        style={{
          position: "absolute",
          top:    ready ? ir.top    : 0,
          left:   ready ? ir.left   : 0,
          width:  ready ? ir.width  : "100%",
          height: ready ? ir.height : "auto",
          display: "block",
          pointerEvents: "none",
          userSelect: "none",
          zIndex: 0,
        }}
      />

      {ready && (
        <>
          {/* ── Item-limit counter badge (free users only) ── */}
          {itemsLeft !== null && (
            <button
              onClick={() => setUpgradeReason("items")}
              data-testid="badge-item-count"
              aria-label={`${totalItems} of ${FREE_ITEM_LIMIT} items used — tap to upgrade`}
              style={{
                position: "absolute",
                top: pY(ir, 0.230), left: "50%", transform: "translateX(-50%)",
                zIndex: 12,
                padding: "3px 14px", borderRadius: 20, border: "none",
                background: totalItems >= FREE_ITEM_LIMIT
                  ? "rgba(200,40,40,0.14)"
                  : "rgba(0,0,0,0.10)",
                boxShadow: totalItems >= FREE_ITEM_LIMIT
                  ? "0 0 0 2px rgba(200,40,40,0.40)"
                  : "0 0 0 1.5px rgba(0,0,0,0.18)",
                color: totalItems >= FREE_ITEM_LIMIT ? "#aa0000" : "#5a3a00",
                fontWeight: 700, fontSize: 11,
                letterSpacing: "0.08em", textTransform: "uppercase",
                whiteSpace: "nowrap", cursor: "pointer",
              }}
            >
              {totalItems}/{FREE_ITEM_LIMIT} ITEMS
            </button>
          )}

          {/* ── Three clothing rows ── */}
          {(() => {
            // Pre-compute tap zones for ALL rows so each row's photo area can
            // be capped at the NEXT row's overlay top — preventing the z=20
            // overlay from hiding the bottom of photos in the row above it.
            const tapH       = Math.max(36, pH(ir, 0.055));
            const rowTapTops = LM.rows.map(lm => pY(ir, lm.btnCY) - tapH / 2);
            const rowTapBots = rowTapTops.map(t => t + tapH);
            const GAP_PX     = 2;

            // Compute carTop/carH for every row first so we can derive a
            // uniform maxPhotoH — the smallest available height across all rows.
            const rowLayouts = LM.rows.map((lm, i) => {
              const nextOverlayTop = i < LM.rows.length - 1
                ? rowTapTops[i + 1]
                : pY(ir, LM.barY);
              // Shoes (i===2): anchor photos to the rod bottom so the gap
              // matches tops/bottoms visually.  The z=20 overlay still covers
              // tapTop → carTop, so the ADD button stays crisp above the photos.
              const carTop = i === 2
                ? pY(ir, lm.boxY) + GAP_PX
                : Math.max(pY(ir, lm.boxY), rowTapBots[i] + GAP_PX);
              const carH   = Math.max(0, nextOverlayTop - carTop);
              return { carTop, carH };
            });

            // All cards same height: constrained by the tightest row (tops/bottoms)
            const minCarH    = Math.min(...rowLayouts.map(r => r.carH));
            const maxPhotoH  = Math.max(0, minCarH - 2);

            return ROWS.map(({ key, btnLabel }, rowIdx) => {
            const lm      = LM.rows[rowIdx];
            const items   = rowData[key];
            const isShoes = rowIdx === 2;
            const { carTop, carH } = rowLayouts[rowIdx];

            // ── Layout constants ──────────────────────────────────────────────
            const carLeft  = pX(ir, LM.doorL);
            const carRight = ir.left + pW(ir, 1 - LM.doorR);

            // "+ ADD" tap zone — centred on the gold rod / pill
            const tapTop = rowTapTops[rowIdx];
            const tapBot = rowTapBots[rowIdx]; // eslint-disable-line @typescript-eslint/no-unused-vars

            // Rod + button overlay — re-draws the background image from the
            // button top down to the first photo pixel, so the pill always
            // appears on top of any photo edge that might reach up.
            // bgPosY uses the absolute pixel offset so the crop aligns with
            // the main <img> (ir.top = 0 always in portrait).
            const overlayTop  = tapTop;
            const overlayH    = carTop - tapTop;   // covers button → first photo
            const bgPosX      = -pW(ir, LM.doorL); // interior left edge offset
            const bgPosY      = -overlayTop;        // aligns bg-image with main img

            return (
              <React.Fragment key={key}>
                {/* Rod + button overlay — z=20 ensures background pill shows
                    above photos.  Covers from button top to first photo row. */}
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top:    overlayTop,
                    left:   carLeft,
                    right:  carRight,
                    height: Math.max(0, overlayH),
                    zIndex: 20,
                    pointerEvents: "none",
                    backgroundImage: "url('/closet-bg.png')",
                    backgroundSize:     `${ir.width}px ${ir.height}px`,
                    backgroundPosition: `${bgPosX}px ${bgPosY}px`,
                    backgroundRepeat:   "no-repeat",
                  }}
                />

                {/* "+ ADD" tap zone — z=22 keeps it above the overlay so it
                    remains fully clickable.  Transparent: visual from background. */}
                <button
                  onClick={addHandlers[key]}
                  aria-label={btnLabel}
                  data-testid={`add-btn-${key}`}
                  style={{
                    position: "absolute",
                    top:    tapTop,
                    left:   pX(ir, LM.doorL),
                    width:  pW(ir, LM.doorR - LM.doorL),
                    height: tapH,
                    zIndex: 22,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    borderRadius: 20,
                  }}
                />

                {/* ClosetRow — clothing photos, guaranteed to start below button */}
                {items.length > 0 && (
                  <div
                    data-testid={`row-${key}`}
                    style={{
                      position: "absolute",
                      top:    carTop,
                      left:   carLeft,
                      right:  carRight,
                      height: carH,
                      zIndex: 10,
                      overflow: "hidden",
                    }}
                  >
                    <ClosetRow
                      ref={rowRefs[key]}
                      items={items}
                      onCenteredItem={centredHandlers[key]}
                      onItemTap={handleItemTap}
                      maxPhotoH={maxPhotoH}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          });
          })()}

          {/* ── SAVE OUTFIT bar — transparent tap zones over baked-in rug circles ──
              Visual (hanger icon, "SAVE OUTFIT ♡", dress-form icon) comes from the
              background image.  These HTML elements are invisible tap targets only. */}

          {/* Hanger icon — left circle → Favorites */}
          <button
            onClick={() => navigate("/favorites")}
            data-testid="button-favorites"
            aria-label="View favorites"
            title="Favorites"
            style={{
              position: "absolute",
              top:    pY(ir, LM.barY),
              left:   pX(ir, LM.hangerCX) - 38,
              width:  76,
              height: pH(ir, LM.barBot - LM.barY),
              zIndex: 14,
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          />

          {/* Save Outfit — centre circle */}
          <AnimatePresence mode="wait">
            {isSaveOpen ? (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                style={{
                  position: "absolute",
                  bottom: `calc(100% - ${pY(ir, LM.barY)}px + 8px)`,
                  left:   16,
                  right:  16,
                  display: "flex",
                  gap: 6,
                  zIndex: 20,
                }}
              >
                <input
                  autoFocus
                  type="text"
                  placeholder="Name this outfit…"
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSave()}
                  data-testid="input-outfit-name"
                  style={{
                    flex: 1, height: 38, borderRadius: 20, padding: "0 14px",
                    fontSize: 13, fontWeight: 600, color: "#3a2400",
                    background: "rgba(255,252,245,0.98)",
                    border: "1.5px solid rgba(196,155,42,0.50)",
                    boxShadow: "0 3px 12px rgba(0,0,0,0.14)",
                    outline: "none",
                  }}
                />
                <button
                  onClick={() => { setIsSaveOpen(false); setSaveName(""); }}
                  style={{
                    width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                    background: "rgba(255,250,240,0.97)",
                    border: "1.5px solid rgba(196,155,42,0.36)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <X style={{ width: 14, height: 14, color: GOLD }} />
                </button>
                <button
                  onClick={handleSave}
                  disabled={!saveName.trim() || saveOutfit.isPending}
                  data-testid="button-save-outfit-confirm"
                  style={{
                    padding: "0 16px", height: 38, borderRadius: 20, flexShrink: 0,
                    background: "linear-gradient(to bottom,#f5d840,#c89018)",
                    color: "#3a2400", fontWeight: 700, fontSize: 13, border: "none",
                    boxShadow: "0 3px 10px rgba(200,168,24,0.32)",
                    opacity: (!saveName.trim() || saveOutfit.isPending) ? 0.42 : 1,
                    cursor: "pointer",
                  }}
                >
                  {saveOutfit.isPending ? "…" : "Save ♡"}
                </button>
              </motion.div>
            ) : (
              <button
                key="save-zone"
                onClick={handleSaveClick}
                data-testid="button-save-outfit"
                aria-label="Save Outfit"
                style={{
                  position: "absolute",
                  top:    pY(ir, LM.barY),
                  left:   pX(ir, LM.saveBtnL),
                  right:  ir.left + pW(ir, 1 - LM.saveBtnR),
                  height: pH(ir, LM.barBot - LM.barY),
                  zIndex: 14,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  borderRadius: 20,
                  boxShadow: canSave
                    ? "0 0 0 2.5px rgba(196,155,42,0.45)"
                    : "none",
                }}
              />
            )}
          </AnimatePresence>

          {/* Mannequin / dress-form icon — right circle → always opens upgrade */}
          <button
            onClick={handleMannequinClick}
            data-testid="button-view-mannequin"
            aria-label="Unlock mannequin view"
            title="Unlock mannequin view"
            style={{
              position: "absolute",
              top:    pY(ir, LM.barY),
              left:   pX(ir, LM.manneCX) - 38,
              width:  76,
              height: pH(ir, LM.barBot - LM.barY),
              zIndex: 14,
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          />
        </>
      )}

      {/* ── Modals ── */}
      <AnimatePresence>
        {upgradeReason && (
          <UpgradeSheet reason={upgradeReason} onClose={() => setUpgradeReason(null)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {addCategory && (
          <QuickAddSheet
            key={addCategory}
            open={!!addCategory}
            onOpenChange={open => !open && setAddCategory(null)}
            category={addCategory}
            existingCount={rowData[addCategory as RowKey]?.length ?? 0}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {detailsItem && (
          <ItemDetailsSheet
            key={detailsItem.id}
            item={detailsItem}
            onClose={() => setDetailsItem(null)}
          />
        )}
      </AnimatePresence>
    </div>

    {/* ── Accessories section ── */}
    {accessories.length > 0 && (
      <div style={{ background: "#FDFAF4", borderTop: "2px solid black", padding: "14px 12px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h3 style={{ fontFamily: "var(--font-display, sans-serif)", fontWeight: 800, fontSize: 15, textTransform: "uppercase", letterSpacing: "-0.01em", margin: 0 }}>
            Accessories
          </h3>
          <button
            onClick={() => handleAddClick("accessories")}
            style={{
              fontFamily: "var(--font-display, sans-serif)", fontWeight: 800, fontSize: 11,
              letterSpacing: "0.08em", textTransform: "uppercase",
              background: "#F0C030", border: "2px solid black", borderRadius: 20,
              padding: "4px 12px", cursor: "pointer",
              boxShadow: "2px 2px 0px 0px rgba(0,0,0,1)",
            }}
          >
            + ADD
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          {accessories.map(item => (
            <button
              key={item.id}
              onClick={() => setDetailsItem(item)}
              style={{
                position: "relative", flexShrink: 0,
                width: 80, height: 80,
                border: "2px solid black", borderRadius: 12,
                background: "#fff", overflow: "hidden",
                cursor: "pointer", padding: 0,
                boxShadow: "2px 2px 0px 0px rgba(0,0,0,1)",
              }}
            >
              {item.imageObjectPath ? (
                <img
                  src={getImageUrl(item.imageObjectPath)!}
                  alt={item.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span style={{ fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>👜</span>
              )}
              {item.isFavorite && (
                <span style={{ position: "absolute", top: 3, right: 3, fontSize: 12 }}>⭐</span>
              )}
            </button>
          ))}
        </div>
      </div>
    )}

    </div>
  );
}
