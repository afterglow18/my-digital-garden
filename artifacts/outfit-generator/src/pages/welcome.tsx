/**
 * WelcomePage — Garden splash screen.
 *
 * IDLE   : full-screen garden photo with title + button.
 * EXITING: whole screen fades to black → onEnter().
 */

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";

interface Props { onEnter: () => void; }

export default function WelcomePage({ onEnter }: Props) {
  const [exiting, setExiting] = useState(false);
  const calledRef = useRef(false);

  const finish = useCallback(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    onEnter();
  }, [onEnter]);

  const handleEnter = () => {
    if (exiting) return;
    setExiting(true);
    setTimeout(finish, 650);
  };

  return (
    <motion.div
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.65, ease: "easeIn" }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        overflow: "hidden",
      }}
    >
      {/* ── Garden background ── */}
      <img
        src="/garden-welcome-bg.png"
        alt=""
        draggable={false}
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          objectFit: "cover",
          objectPosition: "top center",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />

      {/* ── Bottom gradient overlay for text readability ── */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to bottom, transparent 38%, rgba(10,22,8,0.55) 62%, rgba(6,16,4,0.90) 100%)",
        pointerEvents: "none",
      }} />

      {/* ── Content — title + button, pinned to lower third ── */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "0 24px calc(env(safe-area-inset-bottom) + 96px)",
        gap: 10,
      }}>
        {/* Title */}
        <div style={{
          fontFamily: "var(--font-display, serif)",
          fontWeight: 900,
          fontSize: "clamp(30px, 8vw, 48px)",
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
          color: "#F0EBD8",
          textAlign: "center",
          textShadow: "0 2px 12px rgba(0,0,0,0.6)",
        }}>
          MY DIGITAL<br />GARDEN
        </div>

        {/* Subtitle */}
        <div style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.28em",
          textTransform: "uppercase" as const,
          color: "rgba(240,235,216,0.50)",
          textShadow: "0 1px 6px rgba(0,0,0,0.5)",
        }}>
          your digital garden
        </div>

        {/* Enter button */}
        <motion.button
          onClick={handleEnter}
          animate={{ opacity: exiting ? 0 : 1, y: exiting ? 8 : 0 }}
          transition={{ duration: 0.2 }}
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
            whiteSpace: "nowrap",
            pointerEvents: exiting ? "none" : "auto",
          }}
        >
          Enter Garden 🌿
        </motion.button>
      </div>

      {/* ── Footer links ── */}
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
