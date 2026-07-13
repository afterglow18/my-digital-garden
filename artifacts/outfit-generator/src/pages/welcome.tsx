/**
 * WelcomePage — Hollywood suitcase splash screen.
 *
 * OFF  : deep-rose/charcoal mirror face, unlit glass bulbs around perimeter.
 * ON   : bulbs glow warm from top-centre outward (35 ms stagger), then the
 *        suitcase background fades in, then the screen dissolves → onEnter().
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";

// ── Bulb layout ───────────────────────────────────────────────────────────────
// Positions expressed as fractions of the container (0–1).
function makeBulbs() {
  const list: { id: number; fx: number; fy: number }[] = [];
  let id = 0;
  const add = (fx: number, fy: number) => list.push({ id: id++, fx, fy });

  // Top — 9 bulbs
  for (let i = 0; i < 9; i++) add(0.06 + 0.88 * (i / 8), 0.024);
  // Left — 6 bulbs
  for (let i = 0; i < 6; i++) add(0.026, 0.11 + 0.76 * (i / 5));
  // Right — 6 bulbs
  for (let i = 0; i < 6; i++) add(0.974, 0.11 + 0.76 * (i / 5));
  // Bottom — 7 bulbs
  for (let i = 0; i < 7; i++) add(0.08 + 0.84 * (i / 6), 0.952);

  return list;
}

const BULBS = makeBulbs(); // 28 total

// Light-up order: nearest to top-centre fires first
const STAGGER_S = 0.035;
const LIGHT_DELAY = new Map(
  [...BULBS]
    .sort((a, b) =>
      Math.hypot(a.fx - 0.5, a.fy) - Math.hypot(b.fx - 0.5, b.fy)
    )
    .map((b, i) => [b.id, i * STAGGER_S])
);

// Total time until last bulb finishes (used to schedule image reveal)
const LAST_DELAY_S = (BULBS.length - 1) * STAGGER_S + 0.3; // stagger + duration

// ── Bulb component ────────────────────────────────────────────────────────────
function Bulb({
  fx, fy, lit, delay, size, cw, ch,
}: {
  fx: number; fy: number; lit: boolean; delay: number;
  size: number; cw: number; ch: number;
}) {
  return (
    <motion.div
      style={{
        position: "absolute",
        left: cw * fx,
        top: ch * fy,
        width: size,
        height: size,
        borderRadius: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 30,
        pointerEvents: "none",
        border: "2px solid",
      }}
      animate={
        lit
          ? {
              backgroundColor: "#fff9cc",
              borderColor: "#c8960a",
              boxShadow: [
                `0 0 ${size * 0.7}px ${size * 0.35}px rgba(255,246,150,0.85), 0 0 ${size * 1.8}px ${size * 0.9}px rgba(255,220,50,0.55)`,
                `0 0 ${size * 1.0}px ${size * 0.5}px rgba(255,255,200,1.0),   0 0 ${size * 2.5}px ${size * 1.2}px rgba(255,230,60,0.65)`,
                `0 0 ${size * 0.7}px ${size * 0.35}px rgba(255,246,150,0.85), 0 0 ${size * 1.8}px ${size * 0.9}px rgba(255,220,50,0.55)`,
              ],
            }
          : {
              backgroundColor: "#1c0d12",
              borderColor: "#3d1f28",
              boxShadow: "none",
            }
      }
      transition={
        lit
          ? {
              delay,
              duration: 0.28,
              ease: "easeOut",
              boxShadow: {
                delay: delay + 0.28,
                duration: 1.6,
                repeat: Infinity,
                repeatType: "mirror",
                ease: "easeInOut",
              },
            }
          : { duration: 0.12 }
      }
    />
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
interface Props { onEnter: () => void; }

export default function WelcomePage({ onEnter }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(0);
  const [ch, setCh] = useState(0);
  const [phase, setPhase] = useState<"off" | "lighting" | "revealing" | "exiting">("off");
  const calledRef = useRef(false);

  // Measure container on mount and resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => { setCw(el.clientWidth); setCh(el.clientHeight); };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const finish = useCallback(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    onEnter();
  }, [onEnter]);

  const handleEnter = () => {
    if (phase !== "off") return;
    setPhase("lighting");

    // Reveal the bg image after the last bulb lights up
    setTimeout(() => setPhase("revealing"), LAST_DELAY_S * 1000);

    // Fade out whole screen and fire onEnter
    setTimeout(() => setPhase("exiting"), (LAST_DELAY_S + 0.85) * 1000);
    setTimeout(finish, (LAST_DELAY_S + 1.5) * 1000);
  };

  const lit        = phase !== "off";
  const showImage  = phase === "revealing" || phase === "exiting";
  const bulbSize   = cw > 0 ? Math.max(14, Math.round(Math.min(cw, ch) * 0.052)) : 18;

  return (
    <motion.div
      animate={{ opacity: phase === "exiting" ? 0 : 1 }}
      transition={{ duration: 0.65, ease: "easeIn" }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "#08000a",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
      }}
    >
      {/* ── Inner phone-width container ── */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          maxWidth: 448,
          height: "calc(100dvh - 90px)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Mirror face — dark rose, brightens slightly when lit */}
        <motion.div
          style={{ position: "absolute", inset: 0, zIndex: 1 }}
          animate={{
            background: lit
              ? "linear-gradient(170deg, #5a0a28 0%, #200210 60%, #0e0008 100%)"
              : "linear-gradient(170deg, #280410 0%, #0e0008 60%, #050003 100%)",
          }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
        />

        {/* Suitcase background — fades in after bulbs light up */}
        <motion.img
          src="/briefcase-bg.png"
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            zIndex: 2,
            userSelect: "none",
            pointerEvents: "none",
          }}
          animate={{ opacity: showImage ? 1 : 0 }}
          transition={{ duration: 0.9, ease: "easeIn" }}
        />

        {/* Ambient warm glow behind bulbs when lit */}
        <motion.div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 3,
            pointerEvents: "none",
          }}
          animate={{
            background: lit
              ? [
                  "radial-gradient(ellipse 80% 12% at 50% 3%, rgba(255,230,100,0.18) 0%, transparent 100%), radial-gradient(ellipse 8% 60% at 2.6% 50%, rgba(255,220,80,0.12) 0%, transparent 100%), radial-gradient(ellipse 8% 60% at 97.4% 50%, rgba(255,220,80,0.12) 0%, transparent 100%)",
                  "radial-gradient(ellipse 80% 12% at 50% 3%, rgba(255,240,120,0.26) 0%, transparent 100%), radial-gradient(ellipse 8% 60% at 2.6% 50%, rgba(255,230,90,0.18) 0%, transparent 100%), radial-gradient(ellipse 8% 60% at 97.4% 50%, rgba(255,230,90,0.18) 0%, transparent 100%)",
                  "radial-gradient(ellipse 80% 12% at 50% 3%, rgba(255,230,100,0.18) 0%, transparent 100%), radial-gradient(ellipse 8% 60% at 2.6% 50%, rgba(255,220,80,0.12) 0%, transparent 100%), radial-gradient(ellipse 8% 60% at 97.4% 50%, rgba(255,220,80,0.12) 0%, transparent 100%)",
                ]
              : "none",
          }}
          transition={
            lit
              ? { delay: LAST_DELAY_S * 0.5, duration: 1.6, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }
              : { duration: 0.2 }
          }
        />

        {/* ── Bulbs ── */}
        {cw > 0 && BULBS.map((b) => (
          <Bulb
            key={b.id}
            fx={b.fx} fy={b.fy}
            lit={lit}
            delay={LIGHT_DELAY.get(b.id) ?? 0}
            size={bulbSize}
            cw={cw} ch={ch}
          />
        ))}

        {/* ── Title ── */}
        <motion.div
          style={{
            position: "absolute",
            top: "36%",
            left: 0,
            right: 0,
            zIndex: 10,
            textAlign: "center",
            pointerEvents: "none",
            padding: "0 48px",
          }}
          animate={{
            opacity: showImage ? 0 : 1,
          }}
          transition={{ duration: 0.5 }}
        >
          <div
            style={{
              fontFamily: "var(--font-display, serif)",
              fontWeight: 900,
              fontSize: "clamp(30px, 9vw, 44px)",
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              color: lit ? "#fff8ee" : "rgba(255,210,225,0.45)",
              textShadow: lit
                ? "0 0 28px rgba(255,210,100,0.55), 0 2px 10px rgba(0,0,0,0.7)"
                : "none",
              transition: "color 0.9s ease, text-shadow 0.9s ease",
            }}
          >
            MY DIGITAL
            <br />
            SUITCASE
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: "0.22em",
              textTransform: "uppercase" as const,
              color: lit ? "rgba(255,230,180,0.6)" : "rgba(255,180,200,0.25)",
              transition: "color 0.9s ease",
            }}
          >
            your beauty collection
          </div>
        </motion.div>

        {/* ── "Enter Suitcase" button ── */}
        <motion.div
          style={{
            position: "absolute",
            bottom: "13%",
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            zIndex: 40,
          }}
          animate={{
            opacity: phase === "off" ? 1 : 0,
            y: phase === "off" ? 0 : 10,
            pointerEvents: phase === "off" ? "auto" : "none",
          }}
          transition={{ duration: 0.25 }}
        >
          <button
            onClick={handleEnter}
            style={{
              fontFamily: "var(--font-display, sans-serif)",
              fontWeight: 800,
              fontSize: 15,
              letterSpacing: "0.03em",
              color: "#fff",
              background: "rgba(160,10,60,0.60)",
              border: "1.5px solid rgba(255,140,170,0.45)",
              borderRadius: 100,
              padding: "13px 38px",
              cursor: "pointer",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              whiteSpace: "nowrap",
              boxShadow: "0 4px 28px rgba(160,0,60,0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
            }}
          >
            Enter Suitcase ✨
          </button>
        </motion.div>
      </div>

      {/* ── Footer links ── */}
      <div
        style={{
          position: "fixed",
          bottom: "calc(env(safe-area-inset-bottom) + 10px)",
          left: 0,
          right: 0,
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
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.3)", textDecoration: "none", letterSpacing: "0.02em" }}
        >
          Privacy Policy
        </a>
        <a
          href="https://app.notion.com/p/My-Digital-Closet-Support-39782db60653802a9088dcbae84c0527?source=copy_link"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.3)", textDecoration: "none", letterSpacing: "0.02em" }}
        >
          Support
        </a>
      </div>
    </motion.div>
  );
}
