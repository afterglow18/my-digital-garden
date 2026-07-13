/**
 * AuthPage — sign-in / sign-up / forgot-password / reset-password screen.
 */

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthContext } from "@/context/AuthContext";

const IMG_W = 1024;
const IMG_H = 1536;

interface Rect { top: number; left: number; width: number; height: number; }

function useImageRect(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [ir, setIr] = useState<Rect | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function measure() {
      if (!el) return;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      const scale = Math.min(cw / IMG_W, ch / IMG_H);
      const w = IMG_W * scale;
      const h = IMG_H * scale;
      setIr({ top: (ch - h) / 2, left: (cw - w) / 2, width: w, height: h });
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);
  return ir;
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 100,
  padding: "0 18px",
  fontSize: 14,
  fontWeight: 500,
  color: "#4A3A3A",
  background: "rgba(255,255,255,0.70)",
  border: "1.5px solid #D9A7B3",
  outline: "none",
  boxSizing: "border-box",
};

const BTN_STYLE = (loading: boolean): React.CSSProperties => ({
  marginTop: 4,
  height: 46,
  borderRadius: 100,
  fontFamily: "var(--font-display, sans-serif)",
  fontWeight: 800,
  fontSize: 15,
  letterSpacing: "-0.01em",
  color: "#4A3A3A",
  background: loading ? "rgba(244,214,221,0.5)" : "linear-gradient(to bottom, #F4D6DD, #D9A7B3)",
  border: "none",
  cursor: loading ? "not-allowed" : "pointer",
  boxShadow: "0 4px 16px rgba(224,67,122,0.40)",
  transition: "opacity 0.15s",
  width: "100%",
});

type Mode = "signin" | "signup" | "forgot" | "forgot-sent" | "reset" | "reset-done";

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

const EYE_BTN: React.CSSProperties = {
  position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
  background: "none", border: "none", cursor: "pointer", padding: 0,
  color: "rgba(74,58,58,0.5)", display: "flex", alignItems: "center",
};

export default function AuthPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const { login, register } = useAuthContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const ir = useImageRect(containerRef);

  // Detect ?reset_token= in URL on mount
  const [resetToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("reset_token");
  });

  const [mode, setMode] = useState<Mode>(() => (resetToken ? "reset" : "signin"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Clear reset_token from URL without reload
  useEffect(() => {
    if (resetToken) {
      const url = new URL(window.location.href);
      url.searchParams.delete("reset_token");
      window.history.replaceState({}, "", url.toString());
    }
  }, [resetToken]);

  const handleSignInOrUp = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "signin") await login(email, password);
      else await register(email, password);
      onAuthenticated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [mode, email, password, login, register, onAuthenticated]);

  const handleForgot = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setMode("forgot-sent");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleReset = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Reset failed");
      setMode("reset-done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [resetToken, newPassword, confirmPassword]);

  const titles: Record<Mode, string> = {
    signin: "Welcome ✨",
    signup: "Create your suitcase ✨",
    forgot: "Reset password 🔑",
    "forgot-sent": "Check your email 📬",
    reset: "New password 🔑",
    "reset-done": "All done! 🎉",
  };

  // Card positioned so the full form fits without the bottom being cut off
  const cardTop = ir ? ir.top + ir.height * 0.38 : null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#F4D6DD", display: "flex", alignItems: "flex-start", justifyContent: "center", overflow: "hidden" }}>
      <div
        ref={containerRef}
        style={{ width: "100%", maxWidth: 448, height: "calc(100dvh - 90px)", position: "relative", overflow: "hidden", background: "#F4D6DD" }}
      >
        {/* Background wardrobe image */}
        {ir && (
          <img src="/briefcase-bg.png" alt="" draggable={false}
            style={{
              position: "absolute",
              top: ir.top, left: ir.left,
              width: ir.width, height: ir.height,
              display: "block", userSelect: "none", pointerEvents: "none",
            }}
          />
        )}

        {/* Auth card */}
        {cardTop !== null && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            style={{
              position: "absolute", top: cardTop, left: 20, right: 20, zIndex: 10,
              background: "rgba(0,0,0,0.58)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
              borderRadius: 20, border: "1.5px solid rgba(255,255,255,0.18)", boxShadow: "0 8px 40px rgba(0,0,0,0.35)",
              padding: "28px 24px 24px",
            }}
          >
            {/* App name */}
            <p style={{ fontFamily: "var(--font-display,sans-serif)", fontWeight: 900, fontSize: 11, letterSpacing: "0.16em", color: "rgba(74,58,58,0.5)", textTransform: "uppercase", textAlign: "center", marginBottom: 4 }}>
              My Digital Suitcase
            </p>

            {/* Title */}
            <AnimatePresence mode="wait">
              <motion.h1 key={mode} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.18 }}
                style={{ fontFamily: "var(--font-display,sans-serif)", fontWeight: 800, fontSize: 22, color: "#4A3A3A", textAlign: "center", marginBottom: 22, letterSpacing: "-0.02em" }}
              >
                {titles[mode]}
              </motion.h1>
            </AnimatePresence>

            <AnimatePresence mode="wait">

              {/* ── Sign in / Sign up ── */}
              {(mode === "signin" || mode === "signup") && (
                <motion.div key="auth" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                  <form onSubmit={handleSignInOrUp} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required autoCapitalize="none" autoCorrect="off" style={INPUT_STYLE} />
                    <div style={{ position: "relative" }}>
                      <input type={showPassword ? "text" : "password"} placeholder={mode === "signup" ? "Password (min. 6 characters)" : "Password"} value={password} onChange={e => setPassword(e.target.value)} required style={{ ...INPUT_STYLE, paddingRight: 42 }} />
                      <button type="button" style={EYE_BTN} onClick={() => setShowPassword(v => !v)} tabIndex={-1}><EyeIcon open={showPassword} /></button>
                    </div>

                    {mode === "signin" && (
                      <button type="button" onClick={() => { setMode("forgot"); setError(""); }}
                        style={{ alignSelf: "flex-end", background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", padding: 0, marginTop: -4 }}>
                        Forgot password?
                      </button>
                    )}

                    <AnimatePresence>
                      {error && (
                        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          style={{ fontSize: 12, fontWeight: 600, color: "#ff7070", textAlign: "center", margin: "0 4px" }}>
                          {error}
                        </motion.p>
                      )}
                    </AnimatePresence>

                    <button type="submit" disabled={loading} style={BTN_STYLE(loading)}>
                      {loading ? "…" : mode === "signin" ? "Sign In" : "Create Account"}
                    </button>
                  </form>

                  <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}
                    style={{ marginTop: 16, width: "100%", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.55)", textAlign: "center" }}>
                    {mode === "signin" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                  </button>
                </motion.div>
              )}

              {/* ── Forgot password — enter email ── */}
              {mode === "forgot" && (
                <motion.div key="forgot" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                  <form onSubmit={handleForgot} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.7)", textAlign: "center", lineHeight: 1.5, margin: "0 0 4px" }}>
                      Enter your email and we'll send you a reset link. Please check your Spam folder.
                    </p>
                    <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required autoCapitalize="none" autoCorrect="off" style={INPUT_STYLE} />

                    <AnimatePresence>
                      {error && (
                        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          style={{ fontSize: 12, fontWeight: 600, color: "#ff7070", textAlign: "center", margin: "0 4px" }}>
                          {error}
                        </motion.p>
                      )}
                    </AnimatePresence>

                    <button type="submit" disabled={loading} style={BTN_STYLE(loading)}>
                      {loading ? "Sending…" : "Send Reset Link"}
                    </button>
                  </form>
                  <button onClick={() => { setMode("signin"); setError(""); }}
                    style={{ marginTop: 14, width: "100%", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.45)", textAlign: "center" }}>
                    ← Back to sign in
                  </button>
                </motion.div>
              )}

              {/* ── Forgot — email sent confirmation ── */}
              {mode === "forgot-sent" && (
                <motion.div key="forgot-sent" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
                    If an account exists for <strong style={{ color: "#fff" }}>{email}</strong>, a reset link is on its way. Check your inbox (and spam folder just in case).
                  </p>
                  <button onClick={() => { setMode("signin"); setError(""); }} style={BTN_STYLE(false)}>
                    Back to Sign In
                  </button>
                </motion.div>
              )}

              {/* ── Reset password — set new password ── */}
              {mode === "reset" && (
                <motion.div key="reset" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                  <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ position: "relative" }}>
                      <input type={showNew ? "text" : "password"} placeholder="New password (min. 6 characters)" value={newPassword} onChange={e => setNewPassword(e.target.value)} required style={{ ...INPUT_STYLE, paddingRight: 42 }} />
                      <button type="button" style={EYE_BTN} onClick={() => setShowNew(v => !v)} tabIndex={-1}><EyeIcon open={showNew} /></button>
                    </div>
                    <div style={{ position: "relative" }}>
                      <input type={showConfirm ? "text" : "password"} placeholder="Confirm new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required style={{ ...INPUT_STYLE, paddingRight: 42 }} />
                      <button type="button" style={EYE_BTN} onClick={() => setShowConfirm(v => !v)} tabIndex={-1}><EyeIcon open={showConfirm} /></button>
                    </div>

                    <AnimatePresence>
                      {error && (
                        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          style={{ fontSize: 12, fontWeight: 600, color: "#ff7070", textAlign: "center", margin: "0 4px" }}>
                          {error}
                        </motion.p>
                      )}
                    </AnimatePresence>

                    <button type="submit" disabled={loading} style={BTN_STYLE(loading)}>
                      {loading ? "Saving…" : "Set New Password"}
                    </button>
                  </form>
                </motion.div>
              )}

              {/* ── Reset done ── */}
              {mode === "reset-done" && (
                <motion.div key="reset-done" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
                    Your password has been updated. Sign in with your new password.
                  </p>
                  <button onClick={() => { setMode("signin"); setError(""); }} style={BTN_STYLE(false)}>
                    Sign In
                  </button>
                </motion.div>
              )}

            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Bottom links */}
      <div style={{ position: "fixed", bottom: "calc(env(safe-area-inset-bottom) + 10px)", left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, zIndex: 210 }}>
        <a href="https://classy-alpaca-441.notion.site/Privacy-Policy-39682db6065380b19dedcb108d4a0ef4" target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.45)", textDecoration: "none" }}>
          Privacy Policy
        </a>
        <a href="https://app.notion.com/p/My-Digital-Closet-Support-39782db60653802a9088dcbae84c0527?source=copy_link" target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.45)", textDecoration: "none" }}>
          Support
        </a>
      </div>
    </div>
  );
}
