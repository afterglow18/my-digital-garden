/**
 * UpgradeSheet
 *
 * Full-screen paywall — shown when the user taps the mannequin button or hits
 * a free-tier limit (items / outfits).
 *
 * Design:
 *   Background  — cream #F8F4ED
 *   Card        — black, white text
 *   CTA button  — closet-door yellow #F0C030, black text
 */
import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useEntitlements, PurchaseResult } from "@/hooks/useEntitlements";

export type UpgradeReason = "items" | "outfits" | "mannequin";

interface Props {
  reason:  UpgradeReason;
  onClose: () => void;
}

const FEATURES = [
  { emoji: "♾️",  text: "Unlimited beauty products"  },
  { emoji: "💄",  text: "Unlimited saved looks"       },
  { emoji: "☁️",  text: "Save your entire vanity"     },
  { emoji: "💳",  text: "One-time purchase"            },
  { emoji: "🚫",  text: "No monthly subscription"     },
] as const;

const SUBTITLES: Record<UpgradeReason, string> = {
  items:     "You've reached your 20-item limit. Unlock your entire digital vanity with a one-time purchase of $4.99.",
  outfits:   "You've hit the free look limit.",
  mannequin: "A premium feature — unlock it once.",
};

export function UpgradeSheet({ reason, onClose }: Props) {
  const { purchase } = useEntitlements();
  const [status, setStatus] = useState<"idle" | "pending">("idle");

  const handlePurchase = useCallback(async () => {
    if (status === "pending") return;
    setStatus("pending");
    const result: PurchaseResult = await purchase("unlock");
    if (result === "success") {
      onClose();
    } else {
      setStatus("idle");
    }
  }, [status, purchase, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[80] flex flex-col max-w-md mx-auto"
      style={{ background: "#F8F4ED" }}
    >
      {/* Close button */}
      <div className="flex justify-end px-4 pt-4 pb-2 flex-shrink-0">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full border-2 border-black flex items-center justify-center
                     bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                     active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col px-5 pb-4 gap-4 min-h-0">

        {/* Headline */}
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display font-bold text-4xl uppercase tracking-tight leading-none">
            Unlock Your<br />Unlimited<br />Digital Vanity
          </h1>
          <p className="text-sm font-bold text-black/55 mt-2">
            {SUBTITLES[reason]}
          </p>
        </div>

        {/* Black card — flex-1 so it fills remaining space */}
        <div
          className="rounded-3xl overflow-hidden border-4 border-black flex flex-col flex-1 min-h-0"
          style={{ background: "#0a0a0a", boxShadow: "6px 6px 0px 0px rgba(0,0,0,0.35)" }}
        >
          {/* "Upgrade once to unlock:" header */}
          <div className="px-5 pt-5 pb-3 border-b border-white/10 flex-shrink-0">
            <p className="font-display font-bold text-base uppercase tracking-tight text-white">
              Upgrade once to unlock:
            </p>
          </div>

          {/* Feature list — fills space evenly */}
          <ul className="px-5 py-0 flex flex-col flex-1 justify-evenly">
            {FEATURES.map(({ emoji, text }) => (
              <li key={text} className="flex items-center gap-4 py-1">
                <span className="text-xl leading-none w-7 flex-shrink-0 text-center">{emoji}</span>
                <span className="text-white font-semibold text-sm leading-snug">{text}</span>
              </li>
            ))}
          </ul>

          {/* Price */}
          <div className="px-5 pb-5 pt-2 border-t border-white/10 flex-shrink-0">
            <div className="flex items-baseline gap-2">
              <span
                className="font-display font-bold text-5xl leading-none"
                style={{ color: "#F0C030" }}
              >
                $4.99
              </span>
              <span className="text-white/50 font-semibold text-sm leading-tight">
                one&#8209;time
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* CTA footer — extra bottom padding clears iPhone home indicator */}
      <div
        className="px-5 pt-3 flex flex-col gap-3 flex-shrink-0"
        style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={handlePurchase}
          disabled={status === "pending"}
          className="w-full py-4 rounded-2xl font-display font-bold text-xl uppercase
                     tracking-tight border-4 border-black text-black
                     active:translate-x-1 active:translate-y-1 transition-all
                     disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: "#F0C030",
            boxShadow: status === "pending" ? "none" : "5px 5px 0px 0px rgba(0,0,0,1)",
          }}
        >
          {status === "pending" ? "Opening checkout…" : "Unlock Forever – $4.99"}
        </button>
        <button
          onClick={onClose}
          className="text-sm font-bold text-black/40 text-center underline underline-offset-2
                     hover:text-black/60 transition-colors"
        >
          Maybe Later
        </button>
      </div>
    </motion.div>
  );
}
