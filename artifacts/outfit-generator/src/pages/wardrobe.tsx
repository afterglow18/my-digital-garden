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
  useSaveOutfit, useListOutfits, getListOutfitsQueryKey,
  ClothingItem,
} from "@workspace/api-client-react";
import { X, Heart, Bookmark } from "lucide-react";
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
// doorL/doorR: inner mirror area edges (inside the bulb frame)
// rows[i]: sectionTop = y where section starts, shelfY = shelf surface y
// btnCY: y-centre of the baked-in pink ADD pill in the background
const LM = {
  doorL: 0.185,  // x≈190/1024 — left inner edge of white shelf area
  doorR: 0.815,  // x≈835/1024 — right inner edge

  rows: [
    { sectionTop: 0.185, shelfY: 0.395, btnCY: 0.305 },  // TOPS
    { sectionTop: 0.395, shelfY: 0.555, btnCY: 0.478 },  // BOTTOMS
    { sectionTop: 0.555, shelfY: 0.715, btnCY: 0.635 },  // SHOES
    { sectionTop: 0.715, shelfY: 0.855, btnCY: 0.785 },  // ACCESSORIES
  ],

  // Floating save area — just above the baked-in bottom shelf items
  saveAreaY: 0.86,
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
  const [isSaveOpen,    setIsSaveOpen]    = useState(false);
  const [saveName,      setSaveName]      = useState("");

  const { data: makeup     = [] } = useListClothing({ category: "makeup"     }, { query: { queryKey: getListClothingQueryKey({ category: "makeup"     }) } });
  const { data: skincare   = [] } = useListClothing({ category: "skincare"   }, { query: { queryKey: getListClothingQueryKey({ category: "skincare"   }) } });
  const { data: hair       = [] } = useListClothing({ category: "hair"       }, { query: { queryKey: getListClothingQueryKey({ category: "hair"       }) } });
  const { data: fragrances = [] } = useListClothing({ category: "fragrances" }, { query: { queryKey: getListClothingQueryKey({ category: "fragrances" }) } });
  const { data: outfits = [] } = useListOutfits();

  const rowData: Record<RowKey, ClothingItem[]> = { makeup, skincare, hair, fragrances };
  const totalItems = makeup.length + skincare.length + hair.length + fragrances.length;

  const saveOutfit  = useSaveOutfit();
  const queryClient = useQueryClient();
  const { tier, canAddItem, canSaveOutfit } = useEntitlements();

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

  const handleSaveClick = useCallback(() => {
    if (canSaveOutfit(outfits.length)) setIsSaveOpen(true); else setUpgradeReason("outfits");
  }, [canSaveOutfit, outfits.length]);

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
                top: pY(ir, 0.105), left: "50%", transform: "translateX(-50%)",
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

                {/* ── Item carousel — fills the entire shelf section ── */}
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
                      overflow: "hidden",
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

                {/* ── ADD button — shown when section is empty ─────────────
                    Transparent tap zone when items present (covered by carousel),
                    pink pill when empty (matches baked-in image pill below).     */}
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
                  /* Transparent tap zone over entire section when items exist */
                  <button
                    onClick={addHandlers[key]}
                    aria-label={btnLabel}
                    data-testid={`add-btn-${key}`}
                    style={{
                      position: "absolute",
                      top:    secTop,
                      left:   carLeft,
                      width:  carW,
                      height: secH,
                      zIndex: 5, // below carousel (z=10) so carousel handles taps first
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
                  />
                )}

              </React.Fragment>
            );
          })}

          {/* ── Floating SAVE OUTFIT button ───────────────────────────────── */}
          <AnimatePresence mode="wait">
            {isSaveOpen ? (
              <motion.div
                key="save-input"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                style={{
                  position: "absolute",
                  top:   pY(ir, 0.10),
                  left:  pX(ir, LM.doorL),
                  width: pW(ir, LM.doorR - LM.doorL),
                  display: "flex",
                  gap: 6,
                  zIndex: 30,
                }}
              >
                <input
                  autoFocus
                  type="text"
                  placeholder="Name this look…"
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSave()}
                  data-testid="input-outfit-name"
                  style={{
                    flex: 1, height: 36, borderRadius: 20, padding: "0 14px",
                    fontSize: 13, fontWeight: 600, color: "#3a2400",
                    background: "rgba(255,252,248,0.97)",
                    border: "1.5px solid rgba(220,150,160,0.60)",
                    boxShadow: "0 3px 12px rgba(0,0,0,0.14)",
                    outline: "none",
                  }}
                />
                <button
                  onClick={() => { setIsSaveOpen(false); setSaveName(""); }}
                  style={{
                    width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                    background: "rgba(255,248,248,0.97)",
                    border: "1.5px solid rgba(220,150,160,0.40)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <X style={{ width: 14, height: 14, color: "#c06070" }} />
                </button>
                <button
                  onClick={handleSave}
                  disabled={!saveName.trim() || saveOutfit.isPending}
                  data-testid="button-save-outfit-confirm"
                  style={{
                    padding: "0 14px", height: 36, borderRadius: 20, flexShrink: 0,
                    background: "linear-gradient(to bottom, #f7c6d8, #e08090)",
                    color: "#fff", fontWeight: 700, fontSize: 12, border: "none",
                    boxShadow: "0 3px 10px rgba(220,100,130,0.32)",
                    opacity: (!saveName.trim() || saveOutfit.isPending) ? 0.45 : 1,
                    cursor: "pointer",
                  }}
                >
                  {saveOutfit.isPending ? "…" : "Save ♡"}
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="save-pill"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: canSave ? 1 : 0.55, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={handleSaveClick}
                data-testid="button-save-outfit"
                aria-label="Save Outfit"
                style={{
                  position: "absolute",
                  top:       pY(ir, 0.10),
                  left:      "50%",
                  transform: "translateX(-50%)",
                  zIndex: 25,
                  height: 34,
                  padding: "0 20px",
                  borderRadius: 20,
                  border: "none",
                  background: canSave
                    ? "linear-gradient(to bottom, #f7c6d8, #e08090)"
                    : "rgba(255,255,255,0.55)",
                  color: canSave ? "#fff" : "#9a5060",
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase" as const,
                  boxShadow: canSave
                    ? "0 2px 10px rgba(220,100,130,0.35)"
                    : "0 0 0 1.5px rgba(220,150,160,0.35)",
                  cursor: "pointer",
                  whiteSpace: "nowrap" as const,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Heart style={{ width: 13, height: 13 }} />
                Save Outfit
              </motion.button>
            )}
          </AnimatePresence>

          {/* ── Favorites shortcut ── */}
          <button
            onClick={() => navigate("/favorites")}
            data-testid="button-favorites"
            aria-label="View favorites"
            style={{
              position: "absolute",
              top:    pY(ir, 0.10),
              right:  ir.left + pW(ir, 1 - LM.doorR) + 4,
              width:  34,
              height: 34,
              borderRadius: "50%",
              zIndex: 25,
              background: "rgba(255,255,255,0.55)",
              border: "1.5px solid rgba(220,150,160,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Bookmark style={{ width: 15, height: 15, color: "#9a5060" }} />
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
