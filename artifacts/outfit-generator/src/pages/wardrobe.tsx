/**
 * WardrobePage — vanity-bg.png (1024×1536 PNG)
 *
 * Layout: 4 shelf sections inside a Hollywood-mirror frame.
 * Items sit ON TOP of each shelf surface (bottom-anchored within each section).
 * Baked-in pink "ADD X" pills show through the background when shelves are empty;
 * a React-rendered transparent tap zone handles the click.
 * When items are present, the carousel fills the section and covers the pill.
 *
 * Sections (y-fractions of image height):
 *   Section 1 (TOPS):        0.19 → 0.39
 *   Section 2 (BOTTOMS):     0.39 → 0.55
 *   Section 3 (SHOES):       0.55 → 0.71
 *   Section 4 (ACCESSORIES): 0.71 → 0.85
 *
 * No rod-overlay technique needed — shelf surfaces are already below items.
 * Save outfit: floating pill button at the top of the mirror.
 */

import React, {
  useEffect, useRef, useState,
  useCallback, RefObject,
} from "react";
import { useLocation } from "wouter";
import {
  useListClothing, getListClothingQueryKey,
  useListOutfits, getListOutfitsQueryKey,
  ClothingItem,
} from "@workspace/api-client-react";
import { X, Bookmark } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ClosetRow, ClosetRowHandle } from "@/components/ClosetRow";
import { QuickAddSheet } from "@/components/clothing/QuickAddSheet";
import { ItemDetailsSheet } from "@/components/clothing/ItemDetailsSheet";
import { UpgradeSheet, UpgradeReason } from "@/components/paywall/UpgradeSheet";
import { useQueryClient } from "@tanstack/react-query";
import { useEntitlements } from "@/hooks/useEntitlements";
import { FREE_ITEM_LIMIT } from "@/lib/entitlements";

// ── Types ─────────────────────────────────────────────────────────────────────
type RowKey   = "makeup" | "skincare" | "hair" | "fragrances";
type Category = "makeup" | "skincare" | "hair" | "fragrances";

const ROWS: { key: RowKey; btnLabel: string }[] = [
  { key: "makeup",     btnLabel: "+ ADD MAKEUP"     },
  { key: "skincare",   btnLabel: "+ ADD SKINCARE"   },
  { key: "hair",       btnLabel: "+ ADD HAIR"       },
  { key: "fragrances", btnLabel: "+ ADD FRAGRANCES" },
];

// ── Image constants ───────────────────────────────────────────────────────────
const IMG_W = 1024;
const IMG_H = 1536;
const NAV_H = 90;

// ── Landmark fractions (measured from the 1024×1536 vanity PNG) ──────────────
// Pixel-scanned from the new no-shelf background (6AC7C7ED…png).
// doorL/doorR: inner mirror glass edges at mid-height (x=212, x=820 / 1024)
// rows[i].btnCY:     y-centre of the baked-in pink ADD pill
// rows[i].sectionTop: one pixel below the pill bottom — where items begin
// rows[i].shelfY:     top of the NEXT pill — where items end
const LM = {
  doorL: 0.207,  // x≈212/1024 — left inner mirror glass edge
  doorR: 0.801,  // x≈820/1024 — right inner mirror glass edge

  rows: [
    { sectionTop: 0.281, shelfY: 0.384, btnCY: 0.260 },  // MAKEUP     y=432–590
    { sectionTop: 0.430, shelfY: 0.542, btnCY: 0.407 },  // SKINCARE   y=660–832
    { sectionTop: 0.587, shelfY: 0.703, btnCY: 0.565 },  // HAIR       y=902–1080
    { sectionTop: 0.742, shelfY: 0.820, btnCY: 0.723 },  // FRAGRANCES y=1140–1260
  ],

  saveAreaY: 0.84,
} as const;

// ── useImageRect ─────────────────────────────────────────────────────────────
interface ImgRect {
  top: number; left: number; width: number; height: number;
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
        rH = cH; rW = cH * iR; rT = 0; rL = (cW - rW) / 2;
      } else {
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

// ── Page ──────────────────────────────────────────────────────────────────────
export default function WardrobePage() {
  const containerRef = useRef<HTMLDivElement>(null!);
  const ir = useImageRect(containerRef);

  const rowRefs: Record<RowKey, RefObject<ClosetRowHandle | null>> = {
    makeup:     useRef<ClosetRowHandle | null>(null),
    skincare:   useRef<ClosetRowHandle | null>(null),
    hair:       useRef<ClosetRowHandle | null>(null),
    fragrances: useRef<ClosetRowHandle | null>(null),
  };

  const [centred,       setCentred]       = useState<Partial<Record<RowKey, ClothingItem>>>({});
  const [addCategory,   setAddCategory]   = useState<Category | null>(null);
  const [detailsItem,   setDetailsItem]   = useState<ClothingItem | null>(null);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | null>(null);

  const { data: makeup     = [] } = useListClothing({ category: "makeup"     }, { query: { queryKey: getListClothingQueryKey({ category: "makeup"     }) } });
  const { data: skincare   = [] } = useListClothing({ category: "skincare"   }, { query: { queryKey: getListClothingQueryKey({ category: "skincare"   }) } });
  const { data: hair       = [] } = useListClothing({ category: "hair"       }, { query: { queryKey: getListClothingQueryKey({ category: "hair"       }) } });
  const { data: fragrances = [] } = useListClothing({ category: "fragrances" }, { query: { queryKey: getListClothingQueryKey({ category: "fragrances" }) } });
  const { data: outfits = [] } = useListOutfits();

  const rowData: Record<RowKey, ClothingItem[]> = { makeup, skincare, hair, fragrances };
  const totalItems = makeup.length + skincare.length + hair.length + fragrances.length;


  const queryClient = useQueryClient();
  const { tier, canAddItem } = useEntitlements();

  useEffect(() => {
    setCentred(prev => {
      const next = { ...prev };
      let changed = false;
      (["makeup", "skincare", "hair", "fragrances"] as RowKey[]).forEach(key => {
        if (rowData[key].length === 0 && next[key] !== undefined) {
          delete next[key]; changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [makeup.length, skincare.length, hair.length, fragrances.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCentredHandlers: Record<RowKey, (item: ClothingItem | null) => void> = {
    makeup:     useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, makeup:     item ?? undefined })), []),
    skincare:   useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, skincare:   item ?? undefined })), []),
    hair:       useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, hair:       item ?? undefined })), []),
    fragrances: useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, fragrances: item ?? undefined })), []),
  };

  const handleAddClick = useCallback((cat: Category) => {
    if (canAddItem(totalItems)) setAddCategory(cat); else setUpgradeReason("items");
  }, [canAddItem, totalItems]);

  const addHandlers: Record<RowKey, () => void> = {
    makeup:     useCallback(() => handleAddClick("makeup"),     [handleAddClick]),
    skincare:   useCallback(() => handleAddClick("skincare"),   [handleAddClick]),
    hair:       useCallback(() => handleAddClick("hair"),       [handleAddClick]),
    fragrances: useCallback(() => handleAddClick("fragrances"), [handleAddClick]),
  };

  const handleItemTap = useCallback((item: ClothingItem) => setDetailsItem(item), []);

  const [, navigate] = useLocation();
  const isFree    = tier === "free";
  const itemsLeft = isFree ? Math.max(0, FREE_ITEM_LIMIT - totalItems) : null;
  const ready     = ir.width > 0;

  // ── Section layout helpers ────────────────────────────────────────────────
  // Each section: items fill from sectionTop to shelfY.
  // Compute a uniform maxPhotoH from the tightest section.
  const sectionHeights = ready
    ? LM.rows.map(lm => pH(ir, lm.shelfY - lm.sectionTop))
    : LM.rows.map(() => 0);
  const minSectionH  = ready ? Math.min(...sectionHeights) : 0;
  const maxPhotoH    = Math.max(0, minSectionH - 4);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: `min(calc(100dvh - ${NAV_H}px), calc(100vw * ${(IMG_H / IMG_W).toFixed(6)}))`,
        overflow: "hidden",
        // Dusty rose background matches the outer wall colour in the vanity image
        background: "#e8b8b0",
      }}
    >
      {/* ── Background image ── */}
      <img
        src="/vanity-bg.png"
        alt="My Digital Vanity"
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
          {/* ── Item-count badge (free tier) ── */}
          {itemsLeft !== null && (
            <button
              onClick={() => setUpgradeReason("items")}
              data-testid="badge-item-count"
              aria-label={`${totalItems} of ${FREE_ITEM_LIMIT} items used — tap to upgrade`}
              style={{
                position: "absolute",
                top: pY(ir, 0.165), left: "50%", transform: "translateX(-50%)",
                zIndex: 25,
                padding: "3px 14px", borderRadius: 20, border: "none",
                background: totalItems >= FREE_ITEM_LIMIT
                  ? "rgba(200,40,40,0.14)"
                  : "rgba(255,255,255,0.55)",
                boxShadow: totalItems >= FREE_ITEM_LIMIT
                  ? "0 0 0 2px rgba(200,40,40,0.40)"
                  : "0 0 0 1.5px rgba(180,100,110,0.28)",
                color: totalItems >= FREE_ITEM_LIMIT ? "#aa0000" : "#7a3a40",
                fontWeight: 700, fontSize: 10,
                letterSpacing: "0.08em", textTransform: "uppercase",
                whiteSpace: "nowrap", cursor: "pointer",
              }}
            >
              {totalItems}/{FREE_ITEM_LIMIT} ITEMS
            </button>
          )}

          {/* ── 4 shelf rows ── */}
          {ROWS.map(({ key, btnLabel }, rowIdx) => {
            const lm      = LM.rows[rowIdx];
            const items   = rowData[key];

            const secTop  = pY(ir, lm.sectionTop);
            const secH    = pH(ir, lm.shelfY - lm.sectionTop);
            const carLeft = pX(ir, LM.doorL);
            const carW    = pW(ir, LM.doorR - LM.doorL);

            // ADD button: centered in the section at btnCY
            const btnCY   = pY(ir, lm.btnCY);
            const btnH    = Math.max(32, pH(ir, 0.045));

            return (
              <React.Fragment key={key}>

                {/* ── Item carousel — fills the section between buttons ── */}
                {items.length > 0 && (
                  <div
                    data-testid={`row-${key}`}
                    style={{
                      position: "absolute",
                      top:    secTop,
                      left:   carLeft,
                      width:  carW,
                      height: secH,
                      zIndex: 10,
                      overflow: "visible",
                    }}
                  >
                    <ClosetRow
                      ref={rowRefs[key]}
                      items={items}
                      onCenteredItem={setCentredHandlers[key]}
                      onItemTap={handleItemTap}
                      maxPhotoH={maxPhotoH}
                    />
                  </div>
                )}

                {/* ── ADD button ──────────────────────────────────────────
                    Empty section: transparent tap zone over the baked-in pill.
                    Items present: small "+" pill visible in top-right of section. */}
                {items.length === 0 ? (
                  <button
                    onClick={addHandlers[key]}
                    aria-label={btnLabel}
                    data-testid={`add-btn-${key}`}
                    style={{
                      position: "absolute",
                      top:    btnCY - btnH / 2,
                      left:   carLeft,
                      width:  carW,
                      height: btnH,
                      zIndex: 22,
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
                  />
                ) : (
                  <button
                    onClick={addHandlers[key]}
                    aria-label={btnLabel}
                    data-testid={`add-btn-${key}`}
                    style={{
                      position: "absolute",
                      top:    secTop + 6,
                      left:   carLeft + carW - 34,
                      width:  28,
                      height: 28,
                      zIndex: 30,
                      background: "rgba(255,145,176,0.92)",
                      border: "2px solid rgba(0,0,0,0.55)",
                      borderRadius: "50%",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18,
                      lineHeight: 1,
                      color: "#000",
                      fontWeight: 700,
                      boxShadow: "1px 1px 4px rgba(0,0,0,0.25)",
                      padding: 0,
                    }}
                  >
                    +
                  </button>
                )}

              </React.Fragment>
            );
          })}


          {/* ── Saved shortcut — bottom-left of mirror glass, below FRAGRANCES ── */}
          <button
            onClick={() => navigate("/favorites")}
            data-testid="button-saved"
            aria-label="View saved looks"
            style={{
              position: "absolute",
              top:    pY(ir, 0.832),
              left:   pX(ir, LM.doorL + 0.01),
              width:  44,
              height: 44,
              borderRadius: "50%",
              zIndex: 25,
              background: "rgba(255,255,255,0.55)",
              border: "1.5px solid rgba(220,150,160,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Bookmark style={{ width: 18, height: 18, color: "#9a5060" }} />
          </button>
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
  );
}
