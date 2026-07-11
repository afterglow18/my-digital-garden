/**
 * WelcomePage — full-screen splash shown once per session before the wardrobe.
 *
 * Layout:
 *   Fixed overlay, but the inner container is capped at max-w-md so the image
 *   geometry matches the AppLayout phone frame exactly (fixes desktop misalign).
 *   Two yellow door panels (left 50% / right 50%) cover the closet interior.
 *   "Enter Closet ✨" sits on the rug, measured from the live image rect.
 *
 * Animation:
 *   Framer Motion rotateY on each panel (left → −90 °, right → +90 °) with
 *   a CSS perspective parent. Duration 1.25 s, weighted ease. The wardrobe
 *   is pre-rendered beneath so removing this overlay after the animation is
 *   instant and seamless.
 *
 *   A setTimeout fallback fires onEnter after 1.6 s in case onAnimationComplete
 *   is missed due to reduced-motion or animation engine quirks.
 */

import { useRef, useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";

const IMG_W = 1024;
const IMG_H = 1536;

// Fractional y of the button within the closet image.
const RUG_CENTRE_F = 0.56;

// Animation duration in ms — fallback fires after this + a small buffer.
const ANIM_MS = 1250;

interface Rect { top: number; left: number; width: number; height: number; }
interface Props { onEnter: () => void; }

// ── Door panel ───────────────────────────────────────────────────────────────
function DoorPanel({
  side,
  opening,
  onOpenComplete,
}: {
  side: "left" | "right";
  opening: boolean;
  onOpenComplete?: () => void;
}) {
  const isLeft = side === "left";

  return (
    <motion.div
      style={{
        position: "absolute",
        top: 0,
        [isLeft ? "left" : "right"]: 0,
        width: "50%",
        height: "100%",
        background: "#F2C832",
        transformOrigin: isLeft ? "0% 50%" : "100% 50%",
        [isLeft ? "borderRight" : "borderLeft"]: "3px solid rgba(0,0,0,0.22)",
        boxShadow: isLeft
          ? "inset -8px 0 28px rgba(0,0,0,0.09)"
          : "inset  8px 0 28px rgba(0,0,0,0.09)",
        overflow: "hidden",
      }}
      animate={{ rotateY: opening ? (isLeft ? -90 : 90) : 0 }}
      transition={{ duration: ANIM_MS / 1000, ease: [0.42, 0, 0.18, 1] }}
      onAnimationComplete={() => { if (opening) onOpenComplete?.(); }}
    >
      {/* Upper inset rectangle */}
      <div style={{
        position: "absolute", top: "8%", left: "12%", right: "12%", bottom: "54%",
        border: "2px solid rgba(0,0,0,0.12)", borderRadius: 4,
        background: "rgba(255,255,255,0.06)",
      }} />
      {/* Lower inset rectangle */}
      <div style={{
        position: "absolute", top: "50%", left: "12%", right: "12%", bottom: "8%",
        border: "2px solid rgba(0,0,0,0.12)", borderRadius: 4,
        background: "rgba(255,255,255,0.06)",
      }} />
      {/* Knob — on the inner (seam) edge */}
      <div style={{
        position: "absolute",
        [isLeft ? "right" : "left"]: 18,
        top: "50%",
        transform: "translateY(-50%)",
        width: 15, height: 15, borderRadius: "50%",
        background: "radial-gradient(circle at 35% 35%, #f0d060, #8a5e08)",
        boxShadow: "0 2px 6px rgba(0,0,0,0.40), inset 0 1px 3px rgba(255,255,255,0.30)",
      }} />
    </motion.div>
  );
}

// ── useImageRect ──────────────────────────────────────────────────────────────
// Same contain-geometry logic as wardrobe.tsx, referenced to the overlay div.
function useImageRect(ref: React.RefObject<HTMLDivElement>): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  const compute = useCallback(() => {
    const c = ref.current;
    if (!c) return;
    const cW = c.clientWidth, cH = c.clientHeight;
    const iR = IMG_W / IMG_H, cR = cW / cH;
    let rW: number, rH: number, rL: number, rT: number;
    if (cR > iR) { rH = cH; rW = cH * iR; rT = 0; rL = (cW - rW) / 2; }
    else          { rW = cW; rH = cW / iR; rL = 0; rT = 0; }
    setRect({ top: rT, left: rL, width: rW, height: rH });
  }, [ref]);

  useEffect(() => {
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [compute]);

  return rect;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function WelcomePage({ onEnter }: Props) {
  const containerRef = useRef<HTMLDivElement>(null!);
  const ir = useImageRect(containerRef);
  const [opening, setOpening] = useState(false);
  const calledRef = useRef(false);

  // Safe single-call wrapper — both onAnimationComplete and the fallback timer
  // call this; only the first call actually fires onEnter.
  const finish = useCallback(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    onEnter();
  }, [onEnter]);

  // Fallback: fire if onAnimationComplete never arrives (reduced motion, etc.)
  useEffect(() => {
    if (!opening) return;
    const id = window.setTimeout(finish, ANIM_MS + 350);
    return () => window.clearTimeout(id);
  }, [opening, finish]);

  const handleEnter = () => {
    if (opening) return;
    setOpening(true);
  };

  const rugTop = ir ? ir.top + ir.height * RUG_CENTRE_F - 22 : null;

  return (
    // Full-viewport fixed overlay.  The inner div is capped at max-w-md
    // (same constraint as AppLayout's phone frame) so the image-rect
    // geometry matches the underlying wardrobe on every viewport size.
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "#F0C030",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* ── Phone-frame-width inner container ─────────────────────────── */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          maxWidth: 448,           // matches AppLayout max-w-md
          height: "calc(100dvh - 90px)",  // matches main's effective height
          position: "relative",
          overflow: "hidden",
          background: "#F0C030",
        }}
      >
        {/* Background image */}
        {ir && (
          <img
            src="/vanity-bg.png"
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              top: ir.top, left: ir.left,
              width: ir.width, height: ir.height,
              display: "block",
              userSelect: "none",
              pointerEvents: "none",
            }}
          />
        )}

        {/* Door panels + perspective container */}
        {ir && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: ir.top, left: ir.left,
              width: ir.width, height: ir.height,
              perspective: 1400,
              perspectiveOrigin: "50% 42%",
            }}
          >
            <DoorPanel side="left"  opening={opening} />
            <DoorPanel side="right" opening={opening} onOpenComplete={finish} />
          </div>
        )}

        {/* "Enter Closet ✨" button at rug level */}
        {rugTop !== null && (
          <motion.div
            style={{
              position: "absolute",
              top: rugTop,
              left: 0, right: 0,
              display: "flex",
              justifyContent: "center",
              zIndex: 10,
              pointerEvents: opening ? "none" : "auto",
            }}
            animate={opening ? { opacity: 0, y: 6, scale: 0.95 } : { opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.22 }}
          >
            <button
              onClick={handleEnter}
              style={{
                fontFamily: "var(--font-display, sans-serif)",
                fontWeight: 800,
                fontSize: 15,
                letterSpacing: "-0.01em",
                color: "#fff",
                background: "rgba(0,0,0,0.52)",
                border: "1.5px solid rgba(255,255,255,0.42)",
                borderRadius: 100,
                padding: "12px 30px",
                cursor: "pointer",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                whiteSpace: "nowrap",
                boxShadow: "0 4px 20px rgba(0,0,0,0.28)",
              }}
            >
              Enter Vanity ✨
            </button>
          </motion.div>
        )}
      </div>

      {/* Bottom links — centered, stacked */}
      <div
        style={{
          position: "fixed",
          bottom: "calc(env(safe-area-inset-bottom) + 10px)",
          left: 0, right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          zIndex: 210,
        }}
      >
        <a
          href="https://classy-alpaca-441.notion.site/Privacy-Policy-39682db6065380b19dedcb108d4a0ef4"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 11, fontWeight: 500,
            color: "rgba(255,255,255,0.45)",
            textDecoration: "none", letterSpacing: "0.02em",
          }}
        >
          Privacy Policy
        </a>
        <a
          href="https://app.notion.com/p/My-Digital-Closet-Support-39782db60653802a9088dcbae84c0527?source=copy_link"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 11, fontWeight: 500,
            color: "rgba(255,255,255,0.45)",
            textDecoration: "none", letterSpacing: "0.02em",
          }}
        >
          Support
        </a>
      </div>
    </div>
  );
}
