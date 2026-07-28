/**
 * WelcomePage — A wood picket fence door (double gate).
 * Each half-panel is built from individual picket boards with pointed tops,
 * two horizontal rails, and brass hinge hardware. Tapping "Enter Garden"
 * swings both panels open on their outer hinges, revealing the hero garden
 * behind, then fades to the wardrobe page.
 *
 * Phases: IDLE → SWINGING → OPEN → FADING → onEnter()
 */

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";

interface Props { onEnter: () => void; }

type Phase = "idle" | "swinging" | "open" | "fading";

const PICKETS_PER_PANEL = 11;
const RAIL_FRACS = [0.21, 0.64]; // 0–1 fraction of panel height for each rail

// ── One fence-door panel (left or right) ─────────────────────────────────────

function FenceDoorPanel({ side }: { side: "left" | "right" }) {
  const isLeft = side === "left";

  return (
    <div style={{
      width: "100%", height: "100%",
      position: "relative",
      overflow: "hidden",
      // warm off-white fill — shows at nail-gap edges between boards
      background: "#EDE6D2",
    }}>

      {/* ── Vertical picket boards ── */}
      {Array.from({ length: PICKETS_PER_PANEL }).map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${(i / PICKETS_PER_PANEL) * 100}%`,
            // tiny overlap prevents sub-pixel gaps between boards
            width: `${100 / PICKETS_PER_PANEL + 0.2}%`,
            top: 0,
            bottom: "-14px",
            // alternate very subtle cream tones for individual plank depth
            background: i % 2 === 0
              ? "linear-gradient(to right, #F1EBD8 0%, #FEFDF5 50%, #F1EBD8 100%)"
              : "linear-gradient(to right, #FEFDF5 0%, #F7F2E5 50%, #FEFDF5 100%)",
            // pointed top — classic picket silhouette
            clipPath: "polygon(50% 0%, 100% 3%, 100% 100%, 0% 100%, 0% 3%)",
            // hairline shadow on right edge gives separation between boards
            boxShadow: "2px 0 0 rgba(165,148,105,0.22), -1px 0 0 rgba(165,148,105,0.08)",
          }}
        />
      ))}

      {/* ── Horizontal rails — sit on top of the boards ── */}
      {RAIL_FRACS.map((frac) => (
        <div
          key={frac}
          style={{
            position: "absolute",
            left: -2, right: -2,
            top: `${frac * 100}%`,
            height: 18,
            transform: "translateY(-50%)",
            // warm honey-wood gradient
            background: "linear-gradient(to bottom, #D8CC98, #BFB070, #C8BC82, #D8CC98)",
            boxShadow: "0 3px 8px rgba(0,0,0,0.16), 0 -1px 2px rgba(255,255,255,0.35)",
            zIndex: 2,
          }}
        />
      ))}

      {/* ── Dark gradient at bottom — keeps white title + button readable ── */}
      <div style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0,
        height: "46%",
        background:
          "linear-gradient(to bottom, transparent, rgba(6,14,4,0.58) 55%, rgba(4,10,3,0.94) 100%)",
        pointerEvents: "none",
        zIndex: 3,
      }} />

      {/* ── Brass hinge plates on the outer (pivot) edge ── */}
      {[0.19, 0.79].map((frac) => (
        <div
          key={frac}
          style={{
            position: "absolute",
            [isLeft ? "left" : "right"]: 2,
            top: `${frac * 100}%`,
            transform: "translateY(-50%)",
            width: 13,
            height: 36,
            borderRadius: "3px 3px 4px 4px",
            background: "linear-gradient(to right, #9A8840, #D4BC68, #EDD47A, #D4BC68, #9A8840)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.38), inset 0 1px 1px rgba(255,255,255,0.3)",
            zIndex: 5,
          }}
        />
      ))}

      {/* ── Latch ring (left panel only, center seam) ── */}
      {isLeft && (
        <div style={{
          position: "absolute",
          right: -1,
          top: "46%",
          transform: "translateY(-50%)",
          width: 18, height: 18,
          borderRadius: "50%",
          border: "3px solid #C4A840",
          background:
            "radial-gradient(circle at 35% 30%, #EDD47A, #B89030 70%)",
          boxShadow: "0 2px 5px rgba(0,0,0,0.45), inset 0 1px 2px rgba(255,255,255,0.3)",
          zIndex: 6,
        }} />
      )}

      {/* ── Outer frame edge (top, bottom, outer side) ── */}
      <div style={{
        position: "absolute", inset: 0,
        border: "5px solid #C8BB85",
        boxSizing: "border-box",
        // no border on the center-facing side — panels join flush
        ...(isLeft ? { borderRight: "none" } : { borderLeft: "none" }),
        pointerEvents: "none",
        zIndex: 4,
      }} />

      {/* ── Hairline center seam shadow ── */}
      <div style={{
        position: "absolute",
        [isLeft ? "right" : "left"]: 0,
        top: 0, bottom: 0,
        width: 3,
        background: "rgba(80,60,20,0.28)",
        zIndex: 7,
      }} />
    </div>
  );
}

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
    setTimeout(() => {
      setPhase("open");
      setTimeout(() => {
        setPhase("fading");
        setTimeout(finish, 640);
      }, 380);
    }, 920);
  };

  const isOpen = phase !== "idle";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, overflow: "hidden" }}>

      {/* ── Layer 1: Hero garden, revealed as the doors swing open ── */}
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

      {/* ── Layer 2: Fence-door panels — 3D hinge swing ── */}
      <div style={{
        position: "absolute", inset: 0,
        perspective: "950px",
        perspectiveOrigin: "50% 46%",
      }}>

        {/* Left panel — hinged on its left (outer) edge */}
        <motion.div
          animate={{ rotateY: isOpen ? -110 : 0 }}
          transition={{ duration: 0.90, ease: [0.30, 0, 0.10, 1] }}
          style={{
            position: "absolute",
            left: 0, top: 0,
            width: "50%", height: "100%",
            transformOrigin: "0% 50%",
            transformStyle: "preserve-3d",
            willChange: "transform",
          }}
        >
          {/* Front face */}
          <div style={{ position: "absolute", inset: 0 }}>
            <FenceDoorPanel side="left" />
          </div>
          {/* Back face — dark so no bleed-through on iOS */}
          <div style={{
            position: "absolute", inset: 0,
            background: "#1A2C0A",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }} />
        </motion.div>

        {/* Right panel — hinged on its right (outer) edge */}
        <motion.div
          animate={{ rotateY: isOpen ? 110 : 0 }}
          transition={{ duration: 0.90, ease: [0.30, 0, 0.10, 1] }}
          style={{
            position: "absolute",
            right: 0, top: 0,
            width: "50%", height: "100%",
            transformOrigin: "100% 50%",
            transformStyle: "preserve-3d",
            willChange: "transform",
          }}
        >
          {/* Front face */}
          <div style={{ position: "absolute", inset: 0 }}>
            <FenceDoorPanel side="right" />
          </div>
          {/* Back face */}
          <div style={{
            position: "absolute", inset: 0,
            background: "#1A2C0A",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }} />
        </motion.div>
      </div>

      {/* ── Layer 3: Title + button (painted on the door, fades on tap) ── */}
      <motion.div
        animate={{ opacity: phase === "idle" ? 1 : 0, y: phase === "idle" ? 0 : 10 }}
        transition={{ duration: 0.24 }}
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
          fontWeight: 800,
          fontSize: "clamp(30px, 8vw, 46px)",
          letterSpacing: "0.06em",
          lineHeight: 1.12,
          color: "#F0EBD8",
          textAlign: "center",
          textShadow: "0 1px 4px rgba(0,0,0,0.65), 0 2px 12px rgba(0,0,0,0.40)",
        }}>
          MY DIGITAL<br />GARDEN
        </div>

        <div style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.28em",
          textTransform: "uppercase" as const,
          color: "rgba(240,235,216,0.48)",
          textShadow: "0 1px 6px rgba(0,0,0,0.65)",
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

      {/* ── Layer 4: Final fade-to-dark transition ── */}
      <motion.div
        animate={{ opacity: phase === "fading" ? 1 : 0 }}
        transition={{ duration: 0.64 }}
        style={{
          position: "absolute", inset: 0,
          background: "#060E04",
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
          target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.24)", textDecoration: "none", letterSpacing: "0.02em" }}
        >Privacy Policy</a>
        <a
          href="https://app.notion.com/p/My-Digital-Closet-Support-39782db60653802a9088dcbae84c0527?source=copy_link"
          target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.24)", textDecoration: "none", letterSpacing: "0.02em" }}
        >Support</a>
      </div>
    </div>
  );
}
