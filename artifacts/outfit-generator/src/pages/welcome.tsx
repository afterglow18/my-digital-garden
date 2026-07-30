/**
 * WelcomePage — Three-phase splash sequence.
 *
 * Phase 1 "hero"    — full-screen hero image + branding, auto-advances after 2.5 s.
 * Phase 2 "idle"    — fence doors fade in; same branding + "Enter Garden" button.
 * Phase 3 enter     — fence swings open → fades to dark → onEnter().
 *
 * Sequence: hero → idle → swinging → open → fading → onEnter()
 *
 * Session behaviour: shown once per cold launch; App.tsx uses sessionStorage so
 * returning from the background skips straight to the main interface.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";

interface Props { onEnter: () => void; }

type Phase = "hero" | "idle" | "swinging" | "open" | "fading";

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
  // Start in "hero" — auto-advances to "idle" after 2.5 s
  const [phase, setPhase] = useState<Phase>("hero");
  const calledRef    = useRef(false);
  const heroTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    heroTimer.current = setTimeout(() => {
      setPhase((p) => (p === "hero" ? "idle" : p));
    }, 2500);
    return () => { if (heroTimer.current) clearTimeout(heroTimer.current); };
  }, []);

  const finish = useCallback(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    onEnter();
  }, [onEnter]);

  // Phase 3 — tap "Enter Garden": swing → open → fade → onEnter()
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

  const isOpen  = phase === "swinging" || phase === "open" || phase === "fading";
  const showUI  = phase === "hero" || phase === "idle";   // title + "Welcome to" visible
  const showBtn = phase === "idle";                        // button only after fence appears

  return (
    <motion.div
      animate={{ opacity: phase === "fading" ? 0 : 1 }}
      transition={{ duration: 0.45 }}
      style={{ position: "fixed", inset: 0, zIndex: 200, overflow: "hidden" }}
    >

      {/* ── Layer 1: Hero garden image — fades out the moment enter starts ── */}
      <motion.img
        src="/garden-welcome-bg.png"
        alt=""
        draggable={false}
        animate={{ opacity: isOpen ? 0 : 1 }}
        transition={{ duration: 0.25 }}
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          objectFit: "cover", objectPosition: "top center",
          userSelect: "none", pointerEvents: "none",
        }}
      />

      {/* ── Layer 1b: Permanent dark gradient over lower portion ──
           Ensures text is readable in both hero and fence phases.       */}
      <div style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0,
        height: "58%",
        background:
          "linear-gradient(to bottom, transparent, rgba(6,14,4,0.62) 42%, rgba(4,10,3,0.96) 100%)",
        pointerEvents: "none",
        zIndex: 1,
      }} />

      {/* ── Layer 2: Fence-door panels — hidden in hero phase, fade in at idle ── */}
      <motion.div
        animate={{ opacity: phase === "hero" ? 0 : 1 }}
        transition={{ duration: 0.65, ease: "easeInOut" }}
        style={{
          position: "absolute", inset: 0,
          perspective: "950px",
          perspectiveOrigin: "50% 46%",
          zIndex: 2,
        }}
      >
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
          <div style={{ position: "absolute", inset: 0 }}>
            <FenceDoorPanel side="right" />
          </div>
          <div style={{
            position: "absolute", inset: 0,
            background: "#1A2C0A",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }} />
        </motion.div>
      </motion.div>

      {/* ── Layer 3: "Welcome to" + title + button ──
           Visible in both hero and idle; button fades in only at idle.  */}
      <motion.div
        animate={{ opacity: showUI ? 1 : 0, y: showUI ? 0 : 10 }}
        transition={{ duration: 0.28 }}
        style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "0 24px calc(env(safe-area-inset-bottom) + 96px)",
          gap: 6,
          pointerEvents: showUI ? "auto" : "none",
          zIndex: 10,
        }}
      >
        {/* "Welcome to" */}
        <div style={{
          fontFamily: "var(--font-display, sans-serif)",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.26em",
          textTransform: "uppercase" as const,
          color: "rgba(240,235,216,0.68)",
          textShadow: "0 1px 6px rgba(0,0,0,0.70)",
          marginBottom: 2,
        }}>
          Welcome to
        </div>

        {/* App name */}
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
          color: "rgba(240,235,216,0.42)",
          textShadow: "0 1px 6px rgba(0,0,0,0.65)",
        }}>
          your digital garden
        </div>

        {/* Enter button — fades in once the fence appears */}
        <motion.div
          animate={{ opacity: showBtn ? 1 : 0, y: showBtn ? 0 : 8 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          style={{ pointerEvents: showBtn ? "auto" : "none" }}
        >
          <motion.button
            onClick={handleEnter}
            whileTap={{ scale: 0.95 }}
            style={{
              marginTop: 14,
              fontFamily: "var(--font-display, sans-serif)",
              fontWeight: 800,
              fontSize: 15,
              letterSpacing: "0.04em",
              color: "#FAF3E0",
              background: "linear-gradient(to bottom, #A89050, #6B5A28)",
              border: "1.5px solid #8B7335",
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
      </motion.div>

      {/* ── Footer links — appear with the button at idle ── */}
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
        transition: "opacity 0.45s",
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
    </motion.div>
  );
}
