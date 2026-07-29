/**
 * WardrobePage — garden-bg.png (941×1672 PNG)
 *
 * Layout: 4 raised garden beds used as display rows.
 * Items sit inside each soil bed (carousel fills the bed area).
 * Baked-in stone borders define section boundaries.
 * Bottom action bar (plant icon | Save | star) is baked into the image.
 *
 * Sections (y-fractions of image height):
 *   Bed 1 (OUTFITS):    0.295 → 0.415
 *   Bed 2 (BEAUTY):     0.440 → 0.560
 *   Bed 3 (TOILETRIES): 0.585 → 0.705
 *   Bed 4 (ESSENTIALS): 0.730 → 0.850
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
type RowKey   = "tools" | "landscaping" | "decor" | "plants";
type Category = "tools" | "landscaping" | "decor" | "plants";

const ROWS: { key: RowKey; label: string; btnLabel: string }[] = [
  { key: "tools",       label: "🧤 Tools & Supplies", btnLabel: "Add Tools & Supplies"  },
  { key: "landscaping", label: "🪨 Landscaping",      btnLabel: "Add Landscaping items" },
  { key: "decor",       label: "🌿 Garden Décor",     btnLabel: "Add Garden Décor"      },
  { key: "plants",      label: "🌱 Plants",            btnLabel: "Add Plants"            },
];

// ── Image constants ───────────────────────────────────────────────────────────
const IMG_W = 941;
const IMG_H = 1672;
const NAV_H = 90;

// ── Landmark fractions (calibrated for garden-bg.png 941×1672) ───────────────
// 4 raised stone-bordered garden beds; arch + flowers above, action bar below.
// doorL/doorR: left/right extents of the bed display area
const LM = {
  doorL: 0.03,   // left edge of beds
  doorR: 0.97,   // right edge of beds

  rows: [
    { sectionTop: 0.310, shelfY: 0.430, btnCY: 0.295, labelFrac: null,  photoHFrac: 0.92 },  // tools       (bed 1)
    { sectionTop: 0.440, shelfY: 0.560, btnCY: 0.426, labelFrac: 0.427, photoHFrac: 0.85 },  // landscaping (bed 2)
    { sectionTop: 0.565, shelfY: 0.685, btnCY: 0.551, labelFrac: 0.552, photoHFrac: 0.92 },  // decor       (bed 3)
    { sectionTop: 0.710, shelfY: 0.830, btnCY: 0.697, labelFrac: 0.698, photoHFrac: 0.92 },  // plants      (bed 4)
  ],

  saveAreaY: 0.873,
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
    tools:       useRef<ClosetRowHandle | null>(null),
    landscaping: useRef<ClosetRowHandle | null>(null),
    decor:       useRef<ClosetRowHandle | null>(null),
    plants:      useRef<ClosetRowHandle | null>(null),
  };

  const [centred,       setCentred]       = useState<Partial<Record<RowKey, ClothingItem>>>({});
  const [addCategory,   setAddCategory]   = useState<Category | null>(null);
  const [detailsItem,   setDetailsItem]   = useState<ClothingItem | null>(null);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | null>(null);
  const [isSaveOpen,    setIsSaveOpen]    = useState(false);
  const [saveName,      setSaveName]      = useState("");
  const [saveSuccess,   setSaveSuccess]   = useState(false);

  const saveOutfit = useSaveOutfit();

  const { data: toolsItems       = [] } = useListClothing({ category: "tools"       }, { query: { queryKey: getListClothingQueryKey({ category: "tools"       }) } });
  const { data: landscapingItems = [] } = useListClothing({ category: "landscaping" }, { query: { queryKey: getListClothingQueryKey({ category: "landscaping" }) } });
  const { data: decorItems       = [] } = useListClothing({ category: "decor"       }, { query: { queryKey: getListClothingQueryKey({ category: "decor"       }) } });
  const { data: plantsItems      = [] } = useListClothing({ category: "plants"      }, { query: { queryKey: getListClothingQueryKey({ category: "plants"      }) } });
  const { data: savedOutfitsList = [] } = useListOutfits();

  const rowData: Record<RowKey, ClothingItem[]> = { tools: toolsItems, landscaping: landscapingItems, decor: decorItems, plants: plantsItems };
  const totalItems = toolsItems.length + landscapingItems.length + decorItems.length + plantsItems.length;


  const queryClient = useQueryClient();
  const { tier, canAddItem } = useEntitlements();

  useEffect(() => {
    setCentred(prev => {
      const next = { ...prev };
      let changed = false;
      (["tools", "landscaping", "decor", "plants"] as RowKey[]).forEach(key => {
        if (rowData[key].length === 0 && next[key] !== undefined) {
          delete next[key]; changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [toolsItems.length, landscapingItems.length, decorItems.length, plantsItems.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCentredHandlers: Record<RowKey, (item: ClothingItem | null) => void> = {
    tools:       useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, tools:       item ?? undefined })), []),
    landscaping: useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, landscaping: item ?? undefined })), []),
    decor:       useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, decor:       item ?? undefined })), []),
    plants:      useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, plants:      item ?? undefined })), []),
  };

  const handleAddClick = useCallback((cat: Category) => {
    if (canAddItem(totalItems)) setAddCategory(cat); else setUpgradeReason("items");
  }, [canAddItem, totalItems]);

  const addHandlers: Record<RowKey, () => void> = {
    tools:       useCallback(() => handleAddClick("tools"),       [handleAddClick]),
    landscaping: useCallback(() => handleAddClick("landscaping"), [handleAddClick]),
    decor:       useCallback(() => handleAddClick("decor"),       [handleAddClick]),
    plants:      useCallback(() => handleAddClick("plants"),      [handleAddClick]),
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
        background: "#1a2a1a",
      }}
    >
      {/* ── Background image ── */}
      <img
        src="/garden-bg.png"
        alt="My Digital Garden"
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

      {/* ── Cursive heading ── */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        paddingTop: "max(env(safe-area-inset-top), 14px)",
        textAlign: "center",
        zIndex: 30,
        pointerEvents: "none",
      }}>
        <span style={{
          fontFamily: "'Great Vibes', cursive",
          fontSize: 38,
          color: "#ffffff",
          textShadow:
            "0 1px 3px rgba(0,0,0,0.9), " +
            "0 2px 10px rgba(0,0,0,0.7), " +
            "0 4px 24px rgba(0,0,0,0.5)",
          lineHeight: 1.1,
          display: "inline-block",
        }}>
          My Digital Garden
        </span>
      </div>

      {ready && (
        <>
          {/* ── Item-count badge (free tier) ── */}
          {/* Title omitted — garden image has "My Digital Garden" baked into the arch sign */}
          {itemsLeft !== null && (
            <button
              onClick={() => setUpgradeReason("items")}
              data-testid="badge-item-count"
              aria-label={`${totalItems} of ${FREE_ITEM_LIMIT} items used — tap to upgrade`}
              style={{
                position: "absolute",
                top: pY(ir, 0.155), left: "50%", transform: "translateX(-50%)",
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
          {ROWS.map(({ key, label, btnLabel }, rowIdx) => {
            const lm      = LM.rows[rowIdx];
            const items   = rowData[key];

            const secTop  = pY(ir, lm.sectionTop);
            const secH    = pH(ir, lm.shelfY - lm.sectionTop);
            const carLeft = pX(ir, LM.doorL);
            const carW    = pW(ir, LM.doorR - LM.doorL);

            // ADD button: centered in the section at btnCY
            const btnCY   = pY(ir, lm.btnCY);
            const btnH    = Math.max(32, pH(ir, 0.045));

            const labelY = pY(ir, lm.labelFrac ?? (lm.btnCY + (lm.sectionTop - lm.btnCY) * 0.08));

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
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    color: "#ffffff",
                    fontFamily: "var(--font-display)",
                    fontVariant: "small-caps",
                    textShadow: "0 1px 3px rgba(0,0,0,0.60), 0 2px 10px rgba(0,0,0,0.35)",
                    background: "rgba(85,107,47,0.55)",
                    padding: "0 8px",
                    borderRadius: 4,
                    display: "inline-block",
                    lineHeight: 1,
                  }}>
                    {label}
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
                      maxPhotoH={Math.max(0, sectionHeights[rowIdx] * lm.photoHFrac - 4)}
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


          {/* ── Plant icon tap zone (left) → saved looks ── */}
          <button
            onClick={() => navigate("/favorites")}
            data-testid="button-person-icon"
            aria-label="View saved looks"
            style={{
              position: "absolute",
              top:    pY(ir, 0.878),
              left:   pX(ir, 0.02),
              width:  pW(ir, 0.28),
              height: pH(ir, 0.112),
              zIndex: 25,
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          />

          {/* ── Star icon tap zone (right) → premium upgrade ── */}
          <button
            onClick={() => setUpgradeReason("items")}
            aria-label="Upgrade to premium"
            style={{
              position: "absolute",
              top:    pY(ir, 0.878),
              left:   pX(ir, 0.70),
              width:  pW(ir, 0.28),
              height: pH(ir, 0.112),
              zIndex: 25,
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          />

          {/* ── Save button — covers the baked-in "Save" pill centre ── */}
          <button
            onClick={() => { setSaveName(""); setIsSaveOpen(true); }}
            aria-label="Save current look"
            style={{
              position: "absolute",
              top:    pY(ir, 0.880),
              left:   pX(ir, 0.30),
              width:  pW(ir, 0.40),
              height: pH(ir, 0.108),
              borderRadius: 32,
              zIndex: 26,
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          />
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
                  <p style={{ fontWeight: 800, fontSize: 16, fontFamily: "var(--font-display)" }}>Garden Saved!</p>
                </div>
              ) : (
                <>
                  <p style={{ fontWeight: 800, fontSize: 15, fontFamily: "var(--font-display)", marginBottom: 12 }}>
                    Name this garden
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
