/**
 * WelcomePage — Garden gate entrance animation.
 *
 * IDLE     : Two white gate panels cover the screen; title + "Enter Garden" button visible.
 * SWINGING : Button tapped → panels swing open on a 3D hinge (rotateY), title fades.
 * OPEN     : Brief hold — hero garden fully visible behind the open gate.
 * FADING   : Screen fades to black → onEnter() fires → wardrobe page loads.
 */

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";

interface Props { onEnter: () => void; }

type Phase = "idle" | "swinging" | "open" | "fading";

// ── Gate panel visual ──────────────────────────────────────────────────────────

function GatePanel({ side }: { side: "left" | "right" }) {
  const isLeft = side === "left";
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden",
      background: "linear-gradient(160deg, #FEFCF6 0%, #F4EDD8 55%, #EDE4CA 100%)",
    }}>

      {/* Subtle vertical plank tints */}
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{
          position: "absolute",
          left: `${i * 25}%`, width: "25%", top: 0, bottom: 0,
          background: i % 2 === 0
            ? "rgba(0,0,0,0.018)" : "rgba(255,255,255,0.05)",
          borderRight: i < 3 ? "1px solid rgba(180,160,110,0.15)" : "none",
        }} />
      ))}

      {/* Horizontal rails */}
      {[0.10, 0.50, 0.90].map((frac) => (
        <div key={frac} style={{
          position: "absolute", left: 0, right: 0,
          top: `calc(${frac * 100}% - 7px)`, height: 14,
          background: "linear-gradient(to bottom, #E0D4B2, #C8BB90, #E0D4B2)",
          boxShadow: "0 2px 6px rgba(0,0,0,0.14)",
          zIndex: 2,
        }} />
      ))}

      {/* Z-brace diagonals — classic garden gate pattern */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 1 }}
        viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Top section */}
        <line
          x1={isLeft ? 4 : 96} y1="14"
          x2={isLeft ? 96 : 4} y2="48"
          stroke="#C0B080" strokeWidth="1.4" strokeLinecap="round"
        />
        {/* Bottom section — mirrors direction */}
        <line
          x1={isLeft ? 96 : 4} y1="52"
          x2={isLeft ? 4 : 96} y2="88"
          stroke="#C0B080" strokeWidth="1.4" strokeLinecap="round"
        />
      </svg>

      {/* Outer frame */}
      <div style={{
        position: "absolute", inset: 0,
        border: "8px solid #C8BB90",
        boxSizing: "border-box",
        pointerEvents: "none",
        zIndex: 3,
        // Hide the center-facing inner edge border (panels touch flush)
        ...(isLeft
          ? { borderRight: "none" }
          : { borderLeft: "none" }),
      }} />

      {/* Center-seam edge — slightly darker to show the join line */}
      <div style={{
        position: "absolute",
        [isLeft ? "right" : "left"]: 0,
        top: 0, bottom: 0, width: 2,
        background: "rgba(120,100,60,0.35)",
        zIndex: 4,
      }} />

      {/* Hinge plates on the outer edge */}
      {[0.20, 0.80].map((frac) => (
        <div key={frac} style={{
          position: "absolute",
          [isLeft ? "left" : "right"]: 3,
          top: `${frac * 100}%`,
          transform: "translateY(-50%)",
          width: 14, height: 32,
          borderRadius: 4,
          background: "linear-gradient(to right, #A89870, #C8B888, #A89870)",
          boxShadow: "0 2px 5px rgba(0,0,0,0.30)",
          zIndex: 5,
        }} />
      ))}

      {/* Bottom gradient so white text at the bottom stays readable */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: "46%",
        background: "linear-gradient(to bottom, transparent, rgba(10,18,8,0.55) 60%, rgba(6,14,4,0.88) 100%)",
        pointerEvents: "none",
        zIndex: 6,
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
        setTimeout(finish, 620);
      }, 380);
    }, 870);
  };

  const isOpen = phase !== "idle";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, overflow: "hidden" }}>

      {/* ── Layer 1: Hero garden background, always present behind the gate ── */}
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

      {/* ── Layer 2: Gate panels — 3D perspective double-door swing ── */}
      <div style={{
        position: "absolute", inset: 0,
        perspective: "900px",
        perspectiveOrigin: "50% 48%",
      }}>
        {/* Left gate half — hinged on the left edge */}
        <motion.div
          animate={{ rotateY: isOpen ? -108 : 0 }}
          transition={{ duration: 0.88, ease: [0.32, 0, 0.10, 1] }}
          style={{
            position: "absolute", left: 0, top: 0,
            width: "50%", height: "100%",
            transformOrigin: "0% 50%",
            transformStyle: "preserve-3d",
            willChange: "transform",
          }}
        >
          {/* Front face */}
          <div style={{ position: "absolute", inset: 0 }}>
            <GatePanel side="left" />
          </div>
          {/* Back face — prevents see-through on iOS */}
          <div style={{
            position: "absolute", inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            background: "#2A4010",
          }} />
        </motion.div>

        {/* Right gate half — hinged on the right edge */}
        <motion.div
          animate={{ rotateY: isOpen ? 108 : 0 }}
          transition={{ duration: 0.88, ease: [0.32, 0, 0.10, 1] }}
          style={{
            position: "absolute", right: 0, top: 0,
            width: "50%", height: "100%",
            transformOrigin: "100% 50%",
            transformStyle: "preserve-3d",
            willChange: "transform",
          }}
        >
          {/* Front face */}
          <div style={{ position: "absolute", inset: 0 }}>
            <GatePanel side="right" />
          </div>
          {/* Back face */}
          <div style={{
            position: "absolute", inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            background: "#2A4010",
          }} />
        </motion.div>
      </div>

      {/* ── Layer 3: Title + button, centered on the gate, fades out on tap ── */}
      <motion.div
        animate={{ opacity: phase === "idle" ? 1 : 0, y: phase === "idle" ? 0 : 10 }}
        transition={{ duration: 0.28 }}
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          display: "flex", flexDirection: "column", alignItems: "center",
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
          textShadow: "0 2px 14px rgba(0,0,0,0.7)",
        }}>
          MY DIGITAL<br />GARDEN
        </div>

        <div style={{
          fontSize: 11, fontWeight: 500,
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
            fontWeight: 800, fontSize: 15,
            letterSpacing: "0.04em",
            color: "#1A3A12",
            background: "linear-gradient(to bottom, #C8DFB0, #7BAE60)",
            border: "1.5px solid #5A8A40",
            borderRadius: 100,
            padding: "14px 44px",
            cursor: "pointer",
            boxShadow: "0 4px 20px rgba(40,90,20,0.45), 2px 2px 0 rgba(0,0,0,0.55)",
            whiteSpace: "nowrap" as const,
          }}
        >
          Enter Garden 🌿
        </motion.button>
      </motion.div>

      {/* ── Layer 4: Final fade-to-dark before loading the wardrobe ── */}
      <motion.div
        animate={{ opacity: phase === "fading" ? 1 : 0 }}
        transition={{ duration: 0.62 }}
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
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        zIndex: 30,
        opacity: phase === "idle" ? 1 : 0,
        transition: "opacity 0.3s",
        pointerEvents: phase === "idle" ? "auto" : "none",
      }}>
        <a
          href="https://classy-alpaca-441.notion.site/Privacy-Policy-39682db6065380b19dedcb108d4a0ef4"
          target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.25)", textDecoration: "none", letterSpacing: "0.02em" }}
        >Privacy Policy</a>
        <a
          href="https://app.notion.com/p/My-Digital-Closet-Support-39782db60653802a9088dcbae84c0527?source=copy_link"
          target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.25)", textDecoration: "none", letterSpacing: "0.02em" }}
        >Support</a>
      </div>
    </div>
  );
}
