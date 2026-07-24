/**
 * WardrobePage — briefcase-bg.png (1024×1536 PNG)
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
  useSaveOutfit,
  type ClothingItem,
} from "@/hooks/useLocalDB";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ClosetRow, ClosetRowHandle } from "@/components/ClosetRow";
import { QuickAddSheet } from "@/components/clothing/QuickAddSheet";
import { ItemDetailsSheet } from "@/components/clothing/ItemDetailsSheet";
import { UpgradeSheet, UpgradeReason } from "@/components/paywall/UpgradeSheet";
import { useQueryClient } from "@tanstack/react-query";
import { useEntitlements } from "@/hooks/useEntitlements";
import { FREE_ITEM_LIMIT } from "@/lib/entitlements";

// ── Types ─────────────────────────────────────────────────────────────────────
type RowKey   = "outfits" | "beauty" | "toiletries" | "essentials";
type Category = "outfits" | "beauty" | "toiletries" | "essentials";

const ROWS: { key: RowKey; btnLabel: string }[] = [
  { key: "outfits",    btnLabel: "+ ADD OUTFITS"    },
  { key: "beauty",     btnLabel: "+ ADD BEAUTY"     },
  { key: "toiletries", btnLabel: "+ ADD TOILETRIES" },
  { key: "essentials", btnLabel: "+ ADD ESSENTIALS" },
];

// ── Image constants ───────────────────────────────────────────────────────────
const IMG_W = 1024;
const IMG_H = 1536;
const NAV_H = 90;

// ── Landmark fractions (calibrated for suitcase-open-bg.jpg 989×1536) ─────────
// Real-photo suitcase, shot from above.
// Lid interior:  y ≈ 0.05 → 0.38   (rows 1 & 2)
// Main body:     y ≈ 0.42 → 0.80   (rows 3 & 4)
// doorL/doorR:   left/right inner walls of the suitcase interior
const LM = {
  doorL: 0.182,  // inner left wall
  doorR: 0.776,  // inner right wall

  rows: [
    { sectionTop: 0.170, shelfY: 0.265, btnCY: 0.150 },  // OUTFITS  (lid, upper)
    { sectionTop: 0.305, shelfY: 0.400, btnCY: 0.285 },  // BEAUTY   (lid, lower)
    { sectionTop: 0.505, shelfY: 0.618, btnCY: 0.485 },  // TOILETRIES (body, upper)
    { sectionTop: 0.660, shelfY: 0.770, btnCY: 0.640 },  // ESSENTIALS (body, lower)
  ],

  saveAreaY: 0.84,
} as const;

// ── useImageRect ─────────────────────────────────────────────────────────────
interface ImgRect {
  top: number; left: number; width: number; height: number;
  containerH: number; containerW: number;
}

function useImageRect(containerRef: RefObject<HTMLDivElement>): ImgRect {
  const [rect, setRect] = useState<ImgRect>({ top: 0, left: 0, width: 0, height: 0, containerH: 0, containerW: 0 });
  useEffect(() => {
    const compute = () => {
      const c = containerRef.current;
      if (!c) return;
      const cW = c.clientWidth, cH = c.clientHeight;
      const iR = IMG_W / IMG_H;
      // Fill: stretch image to exactly match container — full bed visible
      setRect({ top: 0, left: 0, width: cW, height: cH, containerH: cH, containerW: cW });
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
    outfits:    useRef<ClosetRowHandle | null>(null),
    beauty:     useRef<ClosetRowHandle | null>(null),
    toiletries: useRef<ClosetRowHandle | null>(null),
    essentials: useRef<ClosetRowHandle | null>(null),
  };

  const [centred,       setCentred]       = useState<Partial<Record<RowKey, ClothingItem>>>({});
  const [addCategory,   setAddCategory]   = useState<Category | null>(null);
  const [detailsItem,   setDetailsItem]   = useState<ClothingItem | null>(null);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | null>(null);
  const [isSaveOpen,    setIsSaveOpen]    = useState(false);
  const [saveName,      setSaveName]      = useState("");
  const [saveSuccess,   setSaveSuccess]   = useState(false);

  const saveOutfit = useSaveOutfit();

  const { data: outfitsItems  = [] } = useListClothing({ category: "outfits"    }, { query: { queryKey: getListClothingQueryKey({ category: "outfits"    }) } });
  const { data: beautyItems   = [] } = useListClothing({ category: "beauty"     }, { query: { queryKey: getListClothingQueryKey({ category: "beauty"     }) } });
  const { data: toiletriesItems = [] } = useListClothing({ category: "toiletries" }, { query: { queryKey: getListClothingQueryKey({ category: "toiletries" }) } });
  const { data: essentialsItems = [] } = useListClothing({ category: "essentials" }, { query: { queryKey: getListClothingQueryKey({ category: "essentials" }) } });
  const { data: savedOutfitsList = [] } = useListOutfits();

  const rowData: Record<RowKey, ClothingItem[]> = { outfits: outfitsItems, beauty: beautyItems, toiletries: toiletriesItems, essentials: essentialsItems };
  const totalItems = outfitsItems.length + beautyItems.length + toiletriesItems.length + essentialsItems.length;


  const queryClient = useQueryClient();
  const { tier, canAddItem } = useEntitlements();

  useEffect(() => {
    setCentred(prev => {
      const next = { ...prev };
      let changed = false;
      (["outfits", "beauty", "toiletries", "essentials"] as RowKey[]).forEach(key => {
        if (rowData[key].length === 0 && next[key] !== undefined) {
          delete next[key]; changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [outfitsItems.length, beautyItems.length, toiletriesItems.length, essentialsItems.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCentredHandlers: Record<RowKey, (item: ClothingItem | null) => void> = {
    outfits:    useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, outfits:    item ?? undefined })), []),
    beauty:     useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, beauty:     item ?? undefined })), []),
    toiletries: useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, toiletries: item ?? undefined })), []),
    essentials: useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, essentials: item ?? undefined })), []),
  };

  const handleAddClick = useCallback((cat: Category) => {
    if (canAddItem(totalItems)) setAddCategory(cat); else setUpgradeReason("items");
  }, [canAddItem, totalItems]);

  const addHandlers: Record<RowKey, () => void> = {
    outfits:    useCallback(() => handleAddClick("outfits"),    [handleAddClick]),
    beauty:     useCallback(() => handleAddClick("beauty"),     [handleAddClick]),
    toiletries: useCallback(() => handleAddClick("toiletries"), [handleAddClick]),
    essentials: useCallback(() => handleAddClick("essentials"), [handleAddClick]),
  };

  const handleItemTap = useCallback((item: ClothingItem) => setDetailsItem(item), []);

  const handleSave = () => {
    if (!saveName.trim()) return;
    const itemIds = Object.values(centred)
      .filter((i): i is ClothingItem => i != null)
      .map(i => i.id);
    saveOutfit.mutate(
      { data: { name: saveName.trim(), itemIds } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
          setSaveSuccess(true);
          setTimeout(() => { setIsSaveOpen(false); setSaveSuccess(false); setSaveName(""); }, 1400);
        },
      },
    );
  };

  const [, navigate] = useLocation();
  const isFree    = tier === "free";
  const itemsLeft = isFree ? Math.max(0, FREE_ITEM_LIMIT - totalItems) : null;
  const ready     = ir.width > 0;

  // ── Section layout helpers ────────────────────────────────────────────────
  const sectionHeights = ready
    ? LM.rows.map(lm => pH(ir, lm.shelfY - lm.sectionTop))
    : LM.rows.map(() => 0);

  // Use the smallest row height so all carousels show photos at the same size
  const uniformPhotoH = Math.max(0, Math.min(...sectionHeights) - 4);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        /* On phone: subtract bottom nav. On iPad (md+): full height via CSS var. */
        height: "calc(100dvh - var(--bottom-nav-h, 90px))",
        overflow: "hidden",
        background: "#C8B9A2",
      }}
    >
      {/* ── Background image — object-fit:cover avoids WebKit negative-left clipping bug ── */}
      <img
        src="/suitcase-open-bg.jpg"
        alt="My Digital Suitcase"
        style={{
          position: "absolute",
          top: 0, left: 0,
          width: "100%", height: "100%",
          objectFit: "fill",
          objectPosition: "center",
          display: "block",
          pointerEvents: "none",
          userSelect: "none",
          zIndex: 0,
        }}
      />

      {ready && (
        <>
          {/* ── Page title ── */}
          <div style={{
            position: "absolute",
            top: pY(ir, 0.090),
            left: 8,
            right: 8,
            zIndex: 25,
            textAlign: "center",
            pointerEvents: "none",
            overflow: "hidden",
          }}>
            <div style={{
              fontFamily: "var(--font-display, serif)",
              fontWeight: 900,
              fontSize: Math.max(8, Math.min(pW(ir, 0.030), ir.containerW * 0.040)),
              letterSpacing: "0.08em",
              whiteSpace: "nowrap",
              textTransform: "uppercase",
              color: "#1a0800",
              lineHeight: 1.1,
            }}>
              MY DIGITAL SUITCASE
            </div>
          </div>

          {/* ── Item-count badge (free tier) ── */}
          {itemsLeft !== null && (
            <button
              onClick={() => setUpgradeReason("items")}
              data-testid="badge-item-count"
              aria-label={`${totalItems} of ${FREE_ITEM_LIMIT} items used — tap to upgrade`}
              style={{
                position: "absolute",
                top: pY(ir, 0.108), left: "50%", transform: "translateX(-50%)",
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

            const labelY = pY(ir, lm.btnCY + (lm.sectionTop - lm.btnCY) * 0.08);

            return (
              <React.Fragment key={key}>

                {/* ── Category label (tappable → add photo) ── */}
                <button
                  onClick={addHandlers[key]}
                  aria-label={btnLabel}
                  style={{
                    position: "absolute",
                    top: labelY,
                    left: carLeft,
                    width: carW,
                    transform: "translateY(-50%)",
                    zIndex: 23,
                    textAlign: "center",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <span style={{
                    fontSize: Math.max(9, pH(ir, 0.013)),
                    fontWeight: 800,
                    letterSpacing: "0.12em",
                    color: "#3A2210",
                    fontFamily: "var(--font-display)",
                    textTransform: "uppercase",
                  }}>
                    {btnLabel}
                  </span>
                </button>

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
                      maxPhotoH={uniformPhotoH}
                    />
                  </div>
                )}

                {/* ── ADD button ──────────────────────────────────────────
                    Always a transparent tap zone sitting exactly over the
                    baked-in pink pill in the background image (at btnCY).
                    The carousel lives BELOW the pill (sectionTop > btnCY),
                    so this zone is never obscured by items.               */}
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

              </React.Fragment>
            );
          })}


          {/* ── Person icon tap zone ── */}
          <button
            onClick={() => navigate("/favorites")}
            data-testid="button-person-icon"
            aria-label="View saved looks"
            style={{
              position: "absolute",
              top:    pY(ir, 0.895),
              left:   pX(ir, 0.115),
              width:  pW(ir, 0.170),
              height: pH(ir, 0.080),
              zIndex: 25,
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          />

          {/* ── Lipstick icon tap zone — opens premium upgrade sheet ── */}
          <button
            onClick={() => setUpgradeReason("items")}
            aria-label="Upgrade to premium"
            style={{
              position: "absolute",
              top:    pY(ir, 0.905),
              left:   pX(ir, 0.755),
              width:  pW(ir, 0.110),
              height: pH(ir, 0.065),
              zIndex: 25,
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          />

          {/* ── SAVE circular button — covers the baked-in circle ── */}
          <button
            onClick={() => { setSaveName(""); setIsSaveOpen(true); }}
            aria-label="Save current case"
            style={{
              position: "absolute",
              top:    pY(ir, 0.9466) - pW(ir, 0.074),
              left:   pX(ir, 0.500)  - pW(ir, 0.074),
              width:  pW(ir, 0.148),
              height: pW(ir, 0.148),
              borderRadius: "50%",
              zIndex: 26,
              background: "linear-gradient(160deg, #E8D4B0 0%, #B8894E 100%)",
              border: "2px solid #B8894E",
              boxShadow: "0 2px 8px rgba(120,80,40,0.25)",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 0,
              lineHeight: 1.15,
              padding: 0,
            }}
          >
            <span style={{ fontSize: pW(ir, 0.022), fontWeight: 900, color: "#3A2210", letterSpacing: "0.06em", fontFamily: "var(--font-display)" }}>SAVE</span>
            <span style={{ fontSize: pW(ir, 0.019), fontWeight: 800, color: "#3A2210", letterSpacing: "0.04em", fontFamily: "var(--font-display)" }}>CASE 🤎</span>
          </button>
        </>
      )}

      {/* ── Save modal ── */}
      <AnimatePresence>
        {isSaveOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute", inset: 0, zIndex: 60,
              background: "rgba(0,0,0,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0 24px",
            }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 12 }}
              style={{
                background: "#fff", borderRadius: 20,
                border: "2.5px solid #000",
                boxShadow: "4px 4px 0 #000",
                padding: "24px 20px 20px",
                width: "100%", maxWidth: 340,
              }}
            >
              {saveSuccess ? (
                <div style={{ textAlign: "center", padding: "12px 0" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>💕</div>
                  <p style={{ fontWeight: 800, fontSize: 16, fontFamily: "var(--font-display)" }}>Case saved!</p>
                </div>
              ) : (
                <>
                  <p style={{ fontWeight: 800, fontSize: 15, fontFamily: "var(--font-display)", marginBottom: 12 }}>
                    Name this case
                  </p>
                  <input
                    autoFocus
                    value={saveName}
                    onChange={e => setSaveName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveName.trim() && handleSave()}
                    placeholder="e.g. Sunday Glow ✨"
                    style={{
                      width: "100%", height: 42, borderRadius: 10,
                      border: "2px solid #000", padding: "0 12px",
                      fontSize: 14, fontFamily: "var(--font-display)",
                      boxSizing: "border-box", marginBottom: 12, outline: "none",
                    }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setIsSaveOpen(false)}
                      style={{
                        flex: 1, height: 40, borderRadius: 20,
                        border: "2px solid #000", background: "#fff",
                        fontWeight: 700, fontSize: 13, cursor: "pointer",
                        fontFamily: "var(--font-display)",
                      }}
                    >Cancel</button>
                    <button
                      onClick={handleSave}
                      disabled={!saveName.trim() || saveOutfit.isPending}
                      style={{
                        flex: 1, height: 40, borderRadius: 20,
                        border: "2px solid #B8894E",
                        background: "linear-gradient(to bottom, #E8D4B0, #B8894E)",
                        color: "#3A2210", fontWeight: 800, fontSize: 13,
                        cursor: saveName.trim() ? "pointer" : "default",
                        opacity: saveName.trim() ? 1 : 0.45,
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      {saveOutfit.isPending ? "…" : "Save ♡"}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
