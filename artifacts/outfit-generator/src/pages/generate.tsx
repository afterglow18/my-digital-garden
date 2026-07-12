/**
 * GeneratePage — "Spin It" screen for My Digital Vanity.
 *
 * Uses the same vanity-bg.png (1024×1536) and 4-shelf layout as WardrobePage.
 * Phase machine:
 *   idle     → shelves display items; "✨ Spin It!" button at bottom
 *   spinning → carousels cycle randomly while API is in flight
 *   result   → carousels landed on AI pick; "As If!" + "Save It ♡" buttons
 *   (save input inline, same pattern as wardrobe)
 */

import React, {
  useCallback, useEffect, useRef, useState, RefObject,
} from "react";
import {
  useListClothing, getListClothingQueryKey,
  useGenerateOutfit, useSaveOutfit, getListOutfitsQueryKey,
  ClothingItem,
} from "@workspace/api-client-react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ClosetRow, ClosetRowHandle } from "@/components/ClosetRow";
import { useQueryClient } from "@tanstack/react-query";

// ── Layout constants (same as wardrobe.tsx) ───────────────────────────────────
const IMG_W = 1024;
const IMG_H = 1536;
const NAV_H = 90;
const PINK  = "#e08090";

const LM = {
  doorL: 0.207,
  doorR: 0.801,
  rows: [
    { sectionTop: 0.281, shelfY: 0.384, btnCY: 0.260 },  // MAKEUP
    { sectionTop: 0.430, shelfY: 0.542, btnCY: 0.407 },  // SKINCARE
    { sectionTop: 0.587, shelfY: 0.703, btnCY: 0.565 },  // HAIR
    { sectionTop: 0.742, shelfY: 0.845, btnCY: 0.723 },  // FRAGRANCES
  ],
  // Action bar: from just below FRAGRANCES through the full bottom
  barY:   0.848,
  barBot: 1.000,
} as const;

interface ImgRect {
  top: number; left: number; width: number; height: number;
  containerH: number;
}

function useImageRect(ref: RefObject<HTMLDivElement>): ImgRect {
  const [rect, setRect] = useState<ImgRect>({ top: 0, left: 0, width: 0, height: 0, containerH: 0 });
  useEffect(() => {
    const compute = () => {
      const c = ref.current;
      if (!c) return;
      const cW = c.clientWidth, cH = c.clientHeight;
      const iR = IMG_W / IMG_H;
      const cR = cW / cH;
      let rW: number, rH: number, rL: number, rT: number;
      if (cR > iR) { rH = cH; rW = cH * iR; rT = 0; rL = (cW - rW) / 2; }
      else          { rW = cW; rH = cW / iR; rL = 0; rT = 0; }
      setRect({ top: rT, left: rL, width: rW, height: rH, containerH: cH });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [ref]);
  return rect;
}

const pH = (ir: ImgRect, f: number) => ir.height * f;
const pW = (ir: ImgRect, f: number) => ir.width  * f;
const pX = (ir: ImgRect, f: number) => ir.left   + ir.width  * f;
const pY = (ir: ImgRect, f: number) => ir.top    + ir.height * f;

// ── Types ─────────────────────────────────────────────────────────────────────
type RowKey = "makeup" | "skincare" | "hair" | "fragrances";
type Phase  = "idle" | "spinning" | "result";

const ROWS: { key: RowKey }[] = [
  { key: "makeup"     },
  { key: "skincare"   },
  { key: "hair"       },
  { key: "fragrances" },
];

const MIN_SPIN_MS = 1600;

// ── Page ──────────────────────────────────────────────────────────────────────
export default function GeneratePage() {
  const containerRef = useRef<HTMLDivElement>(null!);
  const ir    = useImageRect(containerRef);
  const ready = ir.width > 0;

  const rowRefs: Record<RowKey, RefObject<ClosetRowHandle | null>> = {
    makeup:     useRef<ClosetRowHandle | null>(null),
    skincare:   useRef<ClosetRowHandle | null>(null),
    hair:       useRef<ClosetRowHandle | null>(null),
    fragrances: useRef<ClosetRowHandle | null>(null),
  };

  const [phase,      setPhase]      = useState<Phase>("idle");
  const [centred,    setCentred]    = useState<Partial<Record<RowKey, ClothingItem>>>({});
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [saveName,   setSaveName]   = useState("");

  const rowDataRef = useRef<Record<RowKey, ClothingItem[]>>({
    makeup: [], skincare: [], hair: [], fragrances: [],
  });

  const { data: makeup     = [] } = useListClothing({ category: "makeup"     }, { query: { queryKey: getListClothingQueryKey({ category: "makeup"     }) } });
  const { data: skincare   = [] } = useListClothing({ category: "skincare"   }, { query: { queryKey: getListClothingQueryKey({ category: "skincare"   }) } });
  const { data: hair       = [] } = useListClothing({ category: "hair"       }, { query: { queryKey: getListClothingQueryKey({ category: "hair"       }) } });
  const { data: fragrances = [] } = useListClothing({ category: "fragrances" }, { query: { queryKey: getListClothingQueryKey({ category: "fragrances" }) } });

  useEffect(() => { rowDataRef.current = { makeup, skincare, hair, fragrances }; }, [makeup, skincare, hair, fragrances]);

  const hasItems = makeup.length > 0 || skincare.length > 0 || hair.length > 0 || fragrances.length > 0;

  const setCentredHandlers: Record<RowKey, (item: ClothingItem | null) => void> = {
    makeup:     useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, makeup:     item ?? undefined })), []),
    skincare:   useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, skincare:   item ?? undefined })), []),
    hair:       useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, hair:       item ?? undefined })), []),
    fragrances: useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, fragrances: item ?? undefined })), []),
  };

  const generateOutfit = useGenerateOutfit();
  const saveOutfit     = useSaveOutfit();
  const queryClient    = useQueryClient();

  // ── Spin ──────────────────────────────────────────────────────────────────
  const spinningRef = useRef(false);

  const startSpin = useCallback(() => {
    if (spinningRef.current) return;
    spinningRef.current = true;
    setPhase("spinning");
    setCentred({});
    setIsSaveOpen(false);
    setSaveName("");

    const spinStart = Date.now();
    const stop: Record<RowKey, boolean> = { makeup: false, skincare: false, hair: false, fragrances: false };

    ROWS.forEach(({ key }, ri) => {
      const INTERVAL = 65 + ri * 18;
      const cycle = () => {
        if (stop[key]) return;
        const items = rowDataRef.current[key];
        if (items.length > 1) {
          rowRefs[key].current?.scrollToIndex(
            Math.floor(Math.random() * items.length),
            false,
          );
        }
        setTimeout(cycle, INTERVAL);
      };
      cycle();
    });

    generateOutfit.mutate(
      { data: { excludeCategories: [] } },
      {
        onSuccess: (data) => {
          const landMap: Partial<Record<RowKey, { item: ClothingItem; idx: number }>> = {};
          data.items.forEach(apiItem => {
            const key = apiItem.category as RowKey;
            if (!["makeup", "skincare", "hair", "fragrances"].includes(key)) return;
            const arr = rowDataRef.current[key];
            const localIdx = arr.findIndex(i => i.id === apiItem.id);
            landMap[key] = { item: apiItem, idx: localIdx >= 0 ? localIdx : 0 };
          });

          const elapsed   = Date.now() - spinStart;
          const extraWait = Math.max(0, MIN_SPIN_MS - elapsed);

          setTimeout(() => {
            ROWS.forEach(({ key }, ri) => {
              setTimeout(() => {
                stop[key] = true;
                const target = landMap[key];
                rowRefs[key].current?.scrollToIndex(target?.idx ?? 0, true);
              }, ri * 280);
            });

            const lastLandAt = (ROWS.length - 1) * 280 + 380;
            setTimeout(() => {
              const newCentred: Partial<Record<RowKey, ClothingItem>> = {};
              ROWS.forEach(({ key }) => {
                if (landMap[key]) newCentred[key] = landMap[key]!.item;
              });
              setCentred(newCentred);
              setPhase("result");
              spinningRef.current = false;
            }, lastLandAt);
          }, extraWait);
        },

        onError: () => {
          ROWS.forEach(({ key }) => { stop[key] = true; });
          setPhase("idle");
          spinningRef.current = false;
        },
      },
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSpin   = useCallback(() => {
    if (!hasItems || phase === "spinning") return;
    startSpin();
  }, [hasItems, phase, startSpin]);

  const handleRespin = useCallback(() => startSpin(), [startSpin]);

  const handleSave = () => {
    if (!saveName.trim()) return;
    const itemIds = Object.values(centred)
      .filter((i): i is ClothingItem => i != null)
      .map(i => i.id);
    saveOutfit.mutate(
      { data: { name: saveName.trim(), itemIds } },
      { onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
        setIsSaveOpen(false);
        setSaveName("");
      }},
    );
  };

  const canSave = Object.keys(centred).length > 0;

  // ── Section layout helpers — per-row, same as wardrobe.tsx ──────────────
  const sectionHeights = ready
    ? LM.rows.map(lm => pH(ir, lm.shelfY - lm.sectionTop))
    : LM.rows.map(() => 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: `min(calc(100dvh - ${NAV_H}px), calc(100vw * ${(IMG_H / IMG_W).toFixed(6)}))`,
        overflow: "hidden",
        background: "#e8b8b0",
      }}
    >
      {/* ── Background image ── */}
      <img
        src="/vanity-bg.png?v=3"
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

      {ready && (() => {
        const carLeft = pX(ir, LM.doorL);
        const carW    = pW(ir, LM.doorR - LM.doorL);

        return (
          <>
            {/* ── 4 shelf carousels + ADD-button covers ── */}
            {ROWS.map(({ key }, rowIdx) => {
              const lm    = LM.rows[rowIdx];
              const items = { makeup, skincare, hair, fragrances }[key];
              const secTop = pY(ir, lm.sectionTop);
              const secH   = pH(ir, lm.shelfY - lm.sectionTop);
              const btnCY  = pY(ir, lm.btnCY);
              const btnH   = Math.max(32, pH(ir, 0.045));

              return (
                <React.Fragment key={key}>

                  {items.length > 0 ? (
                    <div
                      style={{
                        position: "absolute",
                        top: secTop, left: carLeft, width: carW, height: secH,
                        zIndex: 10, overflow: "visible",
                      }}
                    >
                      <ClosetRow
                        ref={rowRefs[key]}
                        items={items}
                        onCenteredItem={setCentredHandlers[key]}
                        maxPhotoH={Math.max(0, sectionHeights[rowIdx] - 4)}
                        disableSwipe
                      />
                    </div>
                  ) : (
                    <div style={{
                      position: "absolute",
                      top: secTop, left: carLeft, width: carW, height: secH,
                      zIndex: 10,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        letterSpacing: "0.09em", textTransform: "uppercase",
                        color: "rgba(180,100,110,0.40)",
                      }}>
                        No items
                      </span>
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            {/* ── Spinning sparkle overlay ── */}
            <AnimatePresence>
              {phase === "spinning" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{
                    position: "absolute",
                    top: "46%", left: "50%",
                    transform: "translate(-50%, -50%)",
                    zIndex: 25,
                    pointerEvents: "none",
                    display: "flex", flexDirection: "column",
                    alignItems: "center", gap: 8,
                  }}
                >
                  <motion.span
                    animate={{ scale: [1, 1.18, 1], rotate: [0, 12, -12, 0] }}
                    transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
                    style={{ fontSize: 26, lineHeight: 1, display: "block" }}
                  >
                    ✨
                  </motion.span>
                  <span style={{
                    fontSize: 10, fontWeight: 800,
                    letterSpacing: "0.13em", textTransform: "uppercase",
                    color: "#7a3040",
                    background: "rgba(255,235,240,0.90)",
                    padding: "3px 11px", borderRadius: 20,
                    whiteSpace: "nowrap",
                  }}>
                    Building your look…
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Empty vanity prompt ── */}
            {!hasItems && (
              <div style={{
                position: "absolute",
                top: "46%", left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 30,
                textAlign: "center",
                padding: "14px 22px",
                borderRadius: 16,
                background: "rgba(255,240,245,0.92)",
                border: "1.5px solid rgba(220,150,160,0.40)",
                boxShadow: "0 4px 18px rgba(0,0,0,0.11)",
                maxWidth: pW(ir, 0.65),
              }}>
                <p style={{
                  fontWeight: 800, fontSize: 12,
                  letterSpacing: "0.07em", textTransform: "uppercase",
                  color: "#7a3040", fontFamily: "var(--font-display)", margin: 0,
                }}>
                  Your vanity is empty
                </p>
                <p style={{
                  fontSize: 11, color: "#9a5060",
                  marginTop: 5, lineHeight: 1.5,
                }}>
                  Add makeup, skincare, hair or fragrances in the Vanity tab first.
                </p>
              </div>
            )}


            {/* ── Action bar — white panel behind buttons ── */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                top:    pY(ir, LM.barY),
                left:   0,
                width:  "100%",
                height: pH(ir, LM.barBot - LM.barY),
                zIndex: 18,
                pointerEvents: "none",
                background: "rgba(255,248,250,0.96)",
                borderTop: "1px solid rgba(220,150,160,0.25)",
              }}
            />

            {/* ── CTA buttons ── */}
            <div
              style={{
                position: "absolute",
                top:    pY(ir, LM.barY),
                left:   pX(ir, LM.doorL),
                width:  pW(ir, LM.doorR - LM.doorL),
                height: pH(ir, LM.barBot - LM.barY),
                zIndex: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AnimatePresence mode="wait">

                {/* IDLE: Spin It */}
                {phase === "idle" && !isSaveOpen && (
                  <motion.button
                    key="spin-btn"
                    initial={{ opacity: 0, scale: 0.88 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.88 }}
                    transition={{ type: "spring", stiffness: 360, damping: 26 }}
                    onClick={handleSpin}
                    disabled={!hasItems}
                    style={{
                      width: "100%", height: 52, borderRadius: 28,
                      border: "2.5px solid #000",
                      background: hasItems
                        ? "linear-gradient(to bottom, #f7c6d8, #e08090)"
                        : "rgba(220,180,190,0.32)",
                      color: hasItems ? "#fff" : "#9a6070",
                      fontWeight: 800, fontSize: 16,
                      letterSpacing: "-0.01em", textTransform: "uppercase",
                      whiteSpace: "nowrap",
                      boxShadow: hasItems ? "3px 3px 0 rgba(0,0,0,0.85)" : "none",
                      cursor: hasItems ? "pointer" : "default",
                      fontFamily: "var(--font-display)",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    }}
                  >
                    ✨ Spin It!
                  </motion.button>
                )}

                {/* SPINNING: bouncing dots */}
                {phase === "spinning" && (
                  <motion.div
                    key="dots"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                      display: "flex", gap: 6,
                      padding: "0 24px", height: 44,
                      alignItems: "center", justifyContent: "center",
                      borderRadius: 24,
                      background: "rgba(255,235,240,0.85)",
                      border: "1.5px solid rgba(220,150,160,0.28)",
                    }}
                  >
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        animate={{ y: [0, -6, 0] }}
                        transition={{
                          repeat: Infinity, duration: 0.65,
                          delay: i * 0.16, ease: "easeInOut",
                        }}
                        style={{
                          width: 7, height: 7, borderRadius: "50%",
                          background: PINK,
                        }}
                      />
                    ))}
                  </motion.div>
                )}

                {/* RESULT: As If! + Save It */}
                {phase === "result" && !isSaveOpen && (
                  <motion.div
                    key="result-btns"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    style={{
                      display: "flex", gap: 10, justifyContent: "center",
                      width: "100%",
                    }}
                  >
                    <button
                      onClick={handleRespin}
                      style={{
                        flexGrow: 1, flexShrink: 1, flexBasis: "0%", minWidth: 0,
                        height: 44, borderRadius: 24,
                        border: "2.5px solid #000",
                        background: "linear-gradient(to bottom, #f7c6d8, #e08090)",
                        color: "#fff",
                        fontFamily: "var(--font-display)",
                        fontWeight: 800, fontSize: 14,
                        letterSpacing: "-0.01em", textTransform: "uppercase",
                        whiteSpace: "nowrap",
                        boxShadow: "2px 2px 0 rgba(0,0,0,0.85)",
                        cursor: "pointer",
                        display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center",
                        gap: 2, padding: "0 12px",
                      }}
                    >
                      <span>As If!</span>
                      <span style={{ fontSize: 14, lineHeight: 1 }}>✨</span>
                    </button>

                    <button
                      onClick={() => setIsSaveOpen(true)}
                      disabled={!canSave}
                      style={{
                        flexGrow: 1, flexShrink: 1, flexBasis: "0%", minWidth: 0,
                        height: 44, borderRadius: 24,
                        border: "2.5px solid #000",
                        background: canSave ? "#fff" : "rgba(240,240,240,0.80)",
                        color: "#5a2030",
                        fontFamily: "var(--font-display)",
                        fontWeight: 800, fontSize: 14,
                        letterSpacing: "-0.01em", textTransform: "uppercase",
                        whiteSpace: "nowrap",
                        boxShadow: canSave ? "2px 2px 0 rgba(0,0,0,0.85)" : "none",
                        cursor: canSave ? "pointer" : "default",
                        opacity: canSave ? 1 : 0.5,
                        display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center",
                        gap: 2, padding: "0 12px",
                      }}
                    >
                      <span>Save It</span>
                      <span style={{ fontSize: 14, lineHeight: 1 }}>♡</span>
                    </button>
                  </motion.div>
                )}

                {/* SAVE INPUT */}
                {isSaveOpen && (
                  <motion.div
                    key="save-input"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    style={{ display: "flex", gap: 6, width: "100%", padding: "0 8px" }}
                  >
                    <input
                      autoFocus
                      type="text"
                      placeholder="Name this look…"
                      value={saveName}
                      onChange={e => setSaveName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSave()}
                      style={{
                        flex: 1, height: 38, borderRadius: 20, padding: "0 14px",
                        fontSize: 13, fontWeight: 600, color: "#5a2030",
                        background: "rgba(255,252,248,0.98)",
                        border: "1.5px solid rgba(220,150,160,0.50)",
                        boxShadow: "0 3px 12px rgba(0,0,0,0.13)",
                        outline: "none",
                      }}
                    />
                    <button
                      onClick={() => { setIsSaveOpen(false); setSaveName(""); }}
                      style={{
                        width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                        background: "rgba(255,248,250,0.97)",
                        border: "1.5px solid rgba(220,150,160,0.36)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer",
                      }}
                    >
                      <X style={{ width: 14, height: 14, color: PINK }} />
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={!saveName.trim() || saveOutfit.isPending}
                      style={{
                        padding: "0 14px", height: 36, borderRadius: 20, flexShrink: 0,
                        background: "linear-gradient(to bottom, #f7c6d8, #e08090)",
                        color: "#fff", fontWeight: 700, fontSize: 13, border: "none",
                        boxShadow: "0 3px 10px rgba(220,100,130,0.30)",
                        opacity: (!saveName.trim() || saveOutfit.isPending) ? 0.42 : 1,
                        cursor: "pointer",
                      }}
                    >
                      {saveOutfit.isPending ? "…" : "Save ♡"}
                    </button>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
          </>
        );
      })()}
    </div>
  );
}
