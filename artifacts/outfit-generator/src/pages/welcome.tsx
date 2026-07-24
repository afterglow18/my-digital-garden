/**
 * WelcomePage — Brown suitcase splash screen.
 *
 * IDLE     : large brown suitcase, closed. Title + button below.
 * OPENING  : lid rotates open (3-D perspective flip), warm inner glow.
 * REVEALING: briefcase-bg.png scales up from suitcase to fill the whole screen.
 * EXITING  : full-screen image fades out → onEnter().
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";

interface Props { onEnter: () => void; }

export default function WelcomePage({ onEnter }: Props) {
  const [phase, setPhase] = useState<"idle" | "opening" | "revealing" | "exiting">("idle");
  const [vw, setVw]       = useState(375);
  const [vh, setVh]       = useState(700);
  const calledRef         = useRef(false);

  // Measure viewport on mount / resize
  useEffect(() => {
    const update = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Welcome graphic is ~80 % of viewport width, capped for tablets
  const SW  = Math.min(vw * 0.80, 360);
  const SH  = SW * 0.68;          // classic briefcase ratio ≈ 3 : 2
  const LH  = SH * 0.44;          // lid is top 44 %
  const BH  = SH - LH;
  const HW  = SW * 0.22;          // handle width
  const HH  = SW * 0.09;          // handle height

  const finish = useCallback(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    onEnter();
  }, [onEnter]);

  const handleOpen = () => {
    if (phase !== "idle") return;
    setPhase("exiting");
    setTimeout(finish, 500);
  };

  const isOpen     = phase !== "idle";
  const isReveal   = phase === "revealing" || phase === "exiting";

  return (
    <motion.div
      animate={{ opacity: phase === "exiting" ? 0 : 1 }}
      transition={{ duration: 0.65, ease: "easeIn" }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* ── Dark background — fades once image takes over ── */}
      <motion.div
        style={{ position: "absolute", inset: 0 }}
        animate={{
          background: isReveal
            ? "#C4A882"
            : isOpen
              ? "radial-gradient(ellipse 70% 50% at 50% 45%, #7B4F2E 0%, #1C0A04 70%)"
              : "#0E0804",
        }}
        transition={{ duration: 0.5 }}
      />

      {/* ── Full-screen briefcase image — scales up from centre when revealing ── */}
      <motion.img
        src="/suitcase-packed-bg.jpg"
        alt=""
        draggable={false}
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          objectFit: "cover",
          zIndex: 8,
          userSelect: "none",
          pointerEvents: "none",
          transformOrigin: "center center",
        }}
        initial={{ opacity: 0, scale: 0.18 }}
        animate={isReveal
          ? { opacity: 1, scale: 1 }
          : { opacity: 0, scale: 0.18 }
        }
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      />

      {/* ── Main content (graphic + text + button) ── */}
      <motion.div
        style={{
          position: "relative", zIndex: 4,
          display: "flex", flexDirection: "column", alignItems: "center",
        }}
        animate={{ opacity: isReveal ? 0 : 1 }}
        transition={{ duration: 0.3 }}
      >
        {/* Handle */}
        <div style={{
          width: HW, height: HH,
          borderRadius: `${HH}px ${HH}px 0 0`,
          border: `${Math.max(4, SW * 0.016)}px solid #7B5030`,
          borderBottom: "none",
          background: "transparent",
          marginBottom: -2,
          position: "relative", zIndex: 2,
          boxShadow: "inset 0 2px 5px rgba(0,0,0,0.4)",
        }} />

        {/* Suitcase shell */}
        <div style={{
          width: SW, height: SH,
          position: "relative",
          perspective: SW * 2.4,
        }}>

          {/* Inner warm glow behind lid */}
          <motion.div
            style={{
              position: "absolute", top: 0,
              left: SW * 0.02, right: SW * 0.02,
              height: LH + 4,
              borderRadius: `${SW * 0.04}px ${SW * 0.04}px 0 0`,
              zIndex: 3,
              background: "radial-gradient(ellipse at 50% 100%, rgba(255,205,90,1) 0%, rgba(230,140,40,0.75) 50%, transparent 100%)",
              filter: `blur(${SW * 0.015}px)`,
            }}
            animate={{ opacity: isOpen ? 1 : 0 }}
            transition={{ duration: 0.35, delay: isOpen ? 0.3 : 0 }}
          />

          {/* LID — 3-D flip */}
          <motion.div
            style={{
              position: "absolute", top: 0, left: 0, right: 0,
              height: LH,
              borderRadius: `${SW * 0.04}px ${SW * 0.04}px 0 0`,
              border: `${SW * 0.009}px solid #2A1408`,
              borderBottom: `${SW * 0.005}px solid #4A2E14`,
              transformOrigin: "top center",
              zIndex: 5,
              overflow: "hidden",
              background: "linear-gradient(160deg, #9B6A42 0%, #6B4020 55%, #8B5830 100%)",
              boxShadow: `inset 0 -1px 0 rgba(0,0,0,0.3), inset 0 ${SW*0.01}px ${SW*0.028}px rgba(255,255,255,0.06)`,
            }}
            animate={isOpen
              ? { rotateX: -172, opacity: [1, 1, 1, 0.5, 0] }
              : { rotateX: 0,    opacity: 1 }
            }
            transition={{ duration: 0.88, ease: [0.3, 0, 0.15, 1] }}
          >
            {/* Stitching */}
            <div style={{ position: "absolute", top: SW * 0.034, left: SW * 0.055, right: SW * 0.055, height: 1, background: "rgba(255,255,255,0.09)", borderRadius: 1 }} />
            <div style={{ position: "absolute", top: SW * 0.048, left: SW * 0.055, right: SW * 0.055, height: 1, background: "rgba(255,255,255,0.04)", borderRadius: 1 }} />
            {/* Sheen */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, height: "38%",
              background: "linear-gradient(to bottom, rgba(255,255,255,0.10), transparent)",
              borderRadius: `${SW * 0.04}px ${SW * 0.04}px 0 0`,
            }} />
          </motion.div>

          {/* SEAM + CLASPS */}
          <div style={{
            position: "absolute",
            top: LH - SW * 0.025,
            left: 0, right: 0,
            height: SW * 0.05,
            background: "#1C0A04",
            zIndex: 6,
            display: "flex", alignItems: "center",
          }}>
            {/* Left clasp */}
            <div style={{
              position: "absolute", left: "26%", transform: "translateX(-50%)",
              width: SW * 0.072, height: SW * 0.038,
              background: "linear-gradient(to bottom, #F0D060, #A07828)",
              borderRadius: SW * 0.010,
              border: `1px solid #7A5818`,
              boxShadow: `0 1px 3px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.28)`,
            }} />
            {/* Right clasp */}
            <div style={{
              position: "absolute", left: "74%", transform: "translateX(-50%)",
              width: SW * 0.072, height: SW * 0.038,
              background: "linear-gradient(to bottom, #F0D060, #A07828)",
              borderRadius: SW * 0.010,
              border: `1px solid #7A5818`,
              boxShadow: `0 1px 3px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.28)`,
            }} />
          </div>

          {/* BODY */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            height: BH,
            borderRadius: `0 0 ${SW * 0.04}px ${SW * 0.04}px`,
            border: `${SW * 0.009}px solid #2A1408`,
            borderTop: "none",
            background: "linear-gradient(to bottom, #6B4020 0%, #9B6A42 100%)",
            boxShadow: `inset 0 ${SW*0.011}px ${SW*0.028}px rgba(0,0,0,0.25), inset 0 -${SW*0.007}px ${SW*0.02}px rgba(255,255,255,0.04)`,
            overflow: "hidden",
          }}>
            {/* Stitching */}
            <div style={{ position: "absolute", bottom: SW * 0.048, left: SW * 0.055, right: SW * 0.055, height: 1, background: "rgba(255,255,255,0.06)", borderRadius: 1 }} />
            <div style={{ position: "absolute", bottom: SW * 0.034, left: SW * 0.055, right: SW * 0.055, height: 1, background: "rgba(255,255,255,0.03)", borderRadius: 1 }} />
            {/* Rivets */}
            {[0.028, 0.972].map((fx, i) => (
              <div key={i} style={{
                position: "absolute",
                left: fx < 0.5 ? SW * 0.028 : undefined,
                right: fx > 0.5 ? SW * 0.028 : undefined,
                top: "50%", transform: "translateY(-50%)",
                width: SW * 0.026, height: SW * 0.026,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #D4A850, #7A5020)",
                border: "1px solid #5A3A10",
              }} />
            ))}
          </div>

          {/* Wheels */}
          {[0.10, 0.90].map((fx, i) => (
            <div key={i} style={{
              position: "absolute",
              bottom: -(SW * 0.034),
              left: SW * fx,
              transform: "translateX(-50%)",
              width: SW * 0.058, height: SW * 0.036,
              borderRadius: `0 0 ${SW * 0.03}px ${SW * 0.03}px`,
              background: "#1C0A04",
              border: "1.5px solid #0A0402",
              overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: SW * 0.006, left: "50%",
                transform: "translateX(-50%)",
                width: SW * 0.030, height: SW * 0.022,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.07)",
              }} />
            </div>
          ))}
        </div>

        {/* Title */}
        <div style={{ marginTop: vh * 0.048, textAlign: "center" }}>
          <div style={{
            fontFamily: "var(--font-display, serif)",
            fontWeight: 900,
            fontSize: `clamp(26px, ${SW * 0.145}px, 46px)`,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            color: "#E8D4B0",
          }}>
            MY DIGITAL<br />GARDEN
          </div>
          <div style={{
            marginTop: 9,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.25em",
            textTransform: "uppercase" as const,
            color: "rgba(232,212,176,0.42)",
          }}>
            your digital garden
          </div>
        </div>

        {/* Button */}
        <motion.button
          onClick={handleOpen}
          animate={{
            opacity: phase === "idle" ? 1 : 0,
            y:       phase === "idle" ? 0  : 8,
          }}
          transition={{ duration: 0.2 }}
          style={{
            marginTop: vh * 0.04,
            fontFamily: "var(--font-display, sans-serif)",
            fontWeight: 800, fontSize: 15,
            letterSpacing: "0.03em",
            color: "#3A2210",
            background: "linear-gradient(to bottom, #E8D4B0, #B8894E)",
            border: "1.5px solid #B8894E",
            borderRadius: 100,
            padding: "13px 40px",
            cursor: "pointer",
            boxShadow: "0 4px 20px rgba(120,80,40,0.45), 2px 2px 0 rgba(0,0,0,0.7)",
            whiteSpace: "nowrap",
            pointerEvents: phase === "idle" ? "auto" : "none",
          }}
        >
          Enter Garden 🌿
        </motion.button>
      </motion.div>

      {/* Footer links */}
      <div style={{
        position: "fixed",
        bottom: "calc(env(safe-area-inset-bottom) + 10px)",
        left: 0, right: 0,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        zIndex: 210,
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
    </motion.div>
  );
}
