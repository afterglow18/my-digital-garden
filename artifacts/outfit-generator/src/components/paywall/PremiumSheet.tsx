/**
 * PremiumSheet
 *
 * Full-screen paywall shown when the user taps the Mannequin button without a
 * premium entitlement. Pitches the Pro Stylist upgrade specifically, while
 * noting that the $4.99 Unlock Forever plan is available if they only want
 * unlimited items/outfits.
 */
import React, { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { X, Check } from "lucide-react";
import { useEntitlements, PurchaseResult } from "@/hooks/useEntitlements";
import type { PurchaseProduct } from "@/lib/entitlements";

interface Props {
  onClose: () => void;
}

const PRO_FEATURES = [
  { emoji: "✅", text: "Everything in Unlock Forever" },
  { emoji: "🧍", text: "360° Mannequin Look View" },
  { emoji: "💄", text: "Dress a realistic mannequin with your saved looks" },
  { emoji: "🔄", text: "Rotate 360° — front, side, and back" },
  { emoji: "🚀", text: "Future Pro features included" },
] as const;

export function PremiumSheet({ onClose }: Props) {
  const { purchase } = useEntitlements();
  const [pending, setPending] = useState<PurchaseProduct | null>(null);

  const handlePurchase = useCallback(
    async (product: PurchaseProduct) => {
      if (pending) return;
      setPending(product);
      const result: PurchaseResult = await purchase(product);
      if (result === "success") {
        onClose();
      } else {
        setPending(null);
      }
    },
    [pending, purchase, onClose],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[80] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 bg-white border-b-2 border-black flex-shrink-0"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}>
        <h2 className="font-display font-bold text-xl uppercase tracking-tight">
          Pro Stylist
        </h2>
        <button
          onClick={onClose}
          className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                     bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                     active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto flex flex-col p-5 gap-5">

        {/* Hero */}
        <div className="border-4 border-black rounded-2xl bg-black text-white
                        shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
          <div className="px-5 pt-6 pb-5 flex flex-col gap-2">
            <span className="text-5xl leading-none">👗</span>
            <p className="font-display font-bold text-3xl uppercase tracking-tight leading-tight mt-1">
              360° Mannequin
            </p>
            <p className="text-sm text-white/60 font-medium leading-snug">
              Dress a realistic mannequin with your saved looks and see them from every angle.
            </p>
          </div>
        </div>

        {/* Feature list */}
        <div className="border-2 border-black rounded-2xl bg-white p-4
                        shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
          <p className="font-display font-bold text-sm uppercase tracking-tight mb-3">
            Pro Stylist includes
          </p>
          <ul className="flex flex-col gap-3">
            {PRO_FEATURES.map(({ emoji, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm leading-snug">
                <span className="text-base leading-none mt-0.5 flex-shrink-0">{emoji}</span>
                <span className="text-black/80">{text}</span>
              </li>
            ))}
          </ul>
        </div>

      </div>

      {/* CTA footer */}
      <div className="px-5 pb-6 pt-4 bg-white border-t-2 border-black flex flex-col gap-3 flex-shrink-0">
        {/* Primary: Pro Stylist */}
        <button
          onClick={() => handlePurchase("premium")}
          disabled={!!pending}
          className="w-full py-4 rounded-xl flex items-center justify-center gap-2
                     font-display font-bold text-lg uppercase tracking-tight border-4 border-black
                     bg-black text-white shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]
                     active:translate-x-1 active:translate-y-1 active:shadow-none
                     disabled:opacity-60 disabled:cursor-not-allowed transition-all"
        >
          {pending === "premium" ? "Opening checkout…" : "Get Pro Stylist – $9.99"}
        </button>

        {/* Secondary: Unlock Forever (if they just want unlimited without mannequin) */}
        <button
          onClick={() => handlePurchase("unlock")}
          disabled={!!pending}
          className="w-full py-3 rounded-xl flex items-center justify-center gap-1.5
                     font-display font-bold text-sm uppercase tracking-tight border-4 border-black
                     bg-primary shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                     active:translate-x-0.5 active:translate-y-0.5 active:shadow-none
                     disabled:opacity-60 disabled:cursor-not-allowed transition-all"
        >
          {pending === "unlock" ? "Opening checkout…" : "Or get Unlock Forever – $4.99 (no mannequin)"}
        </button>

        <button
          onClick={onClose}
          className="text-sm font-bold text-black/40 text-center underline underline-offset-2
                     hover:text-black/60 transition-colors"
        >
          Maybe Later
        </button>

        {/* Legal links — required by Apple */}
        <p className="text-center text-[10px] text-black/30 leading-relaxed">
          <button
            onClick={() => window.open("https://www.apple.com/legal/internet-services/itunes/dev/stdeula/", "_system")}
            className="underline underline-offset-2 hover:text-black/50 transition-colors"
          >
            Terms of Use
          </button>
          {" · "}
          <button
            onClick={() => window.open("https://app.notion.com/p/My-Digital-Collection-Privacy-Policy-39682db6065380b19dedcb108d4a0ef4?source=copy_link", "_system")}
            className="underline underline-offset-2 hover:text-black/50 transition-colors"
          >
            Privacy Policy
          </button>
        </p>
      </div>
    </motion.div>
  );
}
