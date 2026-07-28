/**
 * WelcomePage — Tall white picket fence covers the screen.
 * Tapping "Enter Garden" lifts the fence skyward (left-to-right stagger),
 * revealing the hero garden behind it, then fades to the wardrobe page.
 *
 * Phases:
 *   IDLE     → Fence visible, title + button at bottom.
 *   SWINGING → Pickets rise off-screen with a left-to-right wave, text fades.
 *   OPEN     → Garden hero fully visible; brief hold.
 *   FADING   → Fade to dark → onEnter() → wardrobe loads.
 */

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";

interface Props { onEnter: () => void; }

type Phase = "idle" | "swinging" | "open" | "fading";

const NUM_PICKETS = 22;
/** Vertical positions (0–1) for the two horizontal fence rails */
const RAIL_FRACS = [0.22, 0.65];

// ── Main component ─────────────────────────────────────────────────────────────

export default function WelcomePage({ onEnter }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const calledRef = useRef(false);

  const finish = useCallback(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    onEnter();
  }, [onEnter]);

  const handleEnter = () => {
    if (phase !== "idle") return;
    setPhase("swinging");
    // Last picket starts at delay 0.28 s and finishes at 0.28 + 0.72 = 1.00 s
    setTimeout(() => {
      setPhase("open");
      setTimeout(() => {
        setPhase("fading");
        setTimeout(finish, 640);
      }, 360);
    }, 1060);
  };

  const isLifting = phase !== "idle";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, overflow: "hidden" }}>

      {/* ── Layer 1: Hero garden revealed behind the rising fence ── */}
      <img
        src="/garden-welcome-bg.png"
        alt=""
        draggable={false}
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          objectFit: "cover", objectPosition: "top center",
          userSelect: "none", pointerEvents: "none",
        }}
      />

      {/* ── Layer 2: Picket fence — lifts skyward on enter ── */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {Array.from({ length: NUM_PICKETS }).map((_, i) => {
          // Left-to-right wave: first picket (i=0) rises immediately,
          // last picket (i=NUM_PICKETS-1) starts 0.28 s later.
          const ltrDelay = (i / (NUM_PICKETS - 1)) * 0.28;

          return (
            <motion.div
              key={i}
              animate={{ y: isLifting ? "-115%" : "0%" }}
              transition={{
                duration: 0.72,
                delay: ltrDelay,
                ease: [0.35, 0, 0.12, 1],
              }}
              style={{
                position: "absolute",
                left: `${(i / NUM_PICKETS) * 100}%`,
                // Tiny width overlap (+0.15%) eliminates sub-pixel gaps between pickets
                width: `${100 / NUM_PICKETS + 0.15}%`,
                top: 0,
                bottom: "-14px",        // extend a hair below screen edge
                // Alternating subtle cream tones give individual plank depth
                background: i % 2 === 0
                  ? "linear-gradient(to right, #F3EEE2 0%, #FEFEF8 50%, #F3EEE2 100%)"
                  : "linear-gradient(to right, #FEFEF8 0%, #F8F4EC 50%, #FEFEF8 100%)",
                // Pentagon clip-path: pointed top, flat sides and bottom
                clipPath: "polygon(50% 0%, 100% 3.5%, 100% 100%, 0% 100%, 0% 3.5%)",
                // Hairline border between planks
                boxShadow: "1px 0 0 rgba(175,160,125,0.20), -1px 0 0 rgba(175,160,125,0.10)",
                willChange: "transform",
              }}
            >
              {/* Horizontal rail segments — move with each picket */}
              {RAIL_FRACS.map((frac) => (
                <div
                  key={frac}
                  style={{
                    position: "absolute",
                    left: -2, right: -2,
                    top: `${frac * 100}%`,
                    height: 16,
                    transform: "translateY(-50%)",
                    background: "linear-gradient(to bottom, #DAD0A2, #C5BA80, #DAD0A2)",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.13)",
                    zIndex: 2,
                  }}
                />
              ))}

              {/* Dark gradient at the bottom of each plank — keeps white text readable */}
              <div
                style={{
                  position: "absolute",
                  bottom: 0, left: 0, right: 0,
                  height: "48%",
                  background:
                    "linear-gradient(to bottom, transparent, rgba(8,16,6,0.60) 62%, rgba(4,12,3,0.92) 100%)",
                  pointerEvents: "none",
                  zIndex: 3,
                }}
              />
            </motion.div>
          );
        })}
      </div>

      {/* ── Layer 3: Title + button (visible on fence, fades when lifted) ── */}
      <motion.div
        animate={{ opacity: phase === "idle" ? 1 : 0, y: phase === "idle" ? 0 : 10 }}
        transition={{ duration: 0.26 }}
        style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "0 24px calc(env(safe-area-inset-bottom) + 96px)",
          gap: 10,
          pointerEvents: phase === "idle" ? "auto" : "none",
          zIndex: 10,
        }}
      >
        <div style={{
          fontFamily: "var(--font-display, serif)",
          fontWeight: 900,
          fontSize: "clamp(30px, 8vw, 48px)",
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
          color: "#F0EBD8",
          textAlign: "center",
          textShadow: "0 2px 14px rgba(0,0,0,0.72)",
        }}>
          MY DIGITAL<br />GARDEN
        </div>

        <div style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.28em",
          textTransform: "uppercase" as const,
          color: "rgba(240,235,216,0.50)",
          textShadow: "0 1px 6px rgba(0,0,0,0.6)",
        }}>
          your digital garden
        </div>

        <motion.button
          onClick={handleEnter}
          whileTap={{ scale: 0.95 }}
          style={{
            marginTop: 14,
            fontFamily: "var(--font-display, sans-serif)",
            fontWeight: 800,
            fontSize: 15,
            letterSpacing: "0.04em",
            color: "#1A3A12",
            background: "linear-gradient(to bottom, #C8DFB0, #7BAE60)",
            border: "1.5px solid #5A8A40",
            borderRadius: 100,
            padding: "14px 44px",
            cursor: "pointer",
            boxShadow:
              "0 4px 20px rgba(40,90,20,0.45), 2px 2px 0 rgba(0,0,0,0.55)",
            whiteSpace: "nowrap" as const,
          }}
        >
          Enter Garden 🌿
        </motion.button>
      </motion.div>

      {/* ── Layer 4: Final fade-to-dark before wardrobe loads ── */}
      <motion.div
        animate={{ opacity: phase === "fading" ? 1 : 0 }}
        transition={{ duration: 0.64 }}
        style={{
          position: "absolute", inset: 0,
          background: "#080F05",
          pointerEvents: "none",
          zIndex: 20,
        }}
      />

      {/* ── Footer links ── */}
      <div style={{
        position: "fixed",
        bottom: "calc(env(safe-area-inset-bottom) + 10px)",
        left: 0, right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        zIndex: 30,
        opacity: phase === "idle" ? 1 : 0,
        transition: "opacity 0.3s",
        pointerEvents: phase === "idle" ? "auto" : "none",
      }}>
        <a
          href="https://classy-alpaca-441.notion.site/Privacy-Policy-39682db6065380b19dedcb108d4a0ef4"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 11, fontWeight: 500,
            color: "rgba(255,255,255,0.25)",
            textDecoration: "none",
            letterSpacing: "0.02em",
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
            color: "rgba(255,255,255,0.25)",
            textDecoration: "none",
            letterSpacing: "0.02em",
          }}
        >
          Support
        </a>
      </div>
    </div>
  );
}
