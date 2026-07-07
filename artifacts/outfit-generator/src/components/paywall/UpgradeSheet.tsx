/**
 * UpgradeSheet
 *
 * Full-screen paywall shown when the user hits the free item or outfit limit.
 * Presents both purchasable tiers side-by-side so the user can choose once:
 *
 *   🔓 Unlock Forever – $4.99  (unlimited items + outfits)
 *   👗 Pro Stylist    – $9.99  (everything above + 3D mannequin)
 */
import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";
import { useEntitlements, PurchaseResult } from "@/hooks/useEntitlements";
import { FREE_ITEM_LIMIT, FREE_OUTFIT_LIMIT, PurchaseProduct } from "@/lib/entitlements";

export type UpgradeReason = "items" | "outfits";

interface Props {
  reason:  UpgradeReason;
  onClose: () => void;
}

// ── Tier definitions ──────────────────────────────────────────────────────────

const UNLOCK_FEATURES = [
  "Unlimited clothing items",
  "Unlimited saved outfits",
  "All core wardrobe features",
  "Future updates to the core app",
] as const;

const PRO_FEATURES = [
  "Everything in Unlock Forever",
  "360° Mannequin Outfit View",
  "Dress a realistic mannequin",
  "Rotate 360° — front, side, back",
  "Future Pro features included",
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function UpgradeSheet({ reason, onClose }: Props) {
  const { purchase } = useEntitlements();

  // Track pending state per product so both buttons can be independently active
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

  const limitLabel =
    reason === "items"
      ? `You've reached ${FREE_ITEM_LIMIT} items — that's the free limit.`
      : `You've saved ${FREE_OUTFIT_LIMIT} outfits — that's the free limit.`;

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[80] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b-2 border-black flex-shrink-0">
        <h2 className="font-display font-bold text-xl uppercase tracking-tight">
          Unlock the Closet
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
      <div className="flex-1 overflow-y-auto flex flex-col p-5 gap-4">

        {/* Limit hit notice */}
        <p className="text-sm font-medium text-black/60 text-center leading-snug px-1">
          {limitLabel} Pick a plan to keep going.
        </p>

        {/* ── Unlock Forever card ──────────────────────────────────────────── */}
        <div className="border-4 border-black rounded-2xl bg-primary
                        shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <p className="font-display font-bold text-2xl uppercase tracking-tight leading-none">
              🔓 Unlock Forever
            </p>
            <p className="font-display font-bold text-4xl mt-1 leading-none">$4.99</p>
            <p className="text-xs font-bold text-black/55 mt-1">
              One-time · No subscription
            </p>
          </div>

          <div className="border-t-2 border-black/15 mx-5" />

          <ul className="px-5 py-4 flex flex-col gap-2">
            {UNLOCK_FEATURES.map((text) => (
              <li key={text} className="flex items-start gap-2 text-sm leading-snug">
                <span className="mt-0.5 w-4 h-4 border-2 border-black rounded-sm flex-shrink-0
                                 flex items-center justify-center bg-white">
                  <Check className="w-2.5 h-2.5" strokeWidth={3} />
                </span>
                <span className="text-black/80">{text}</span>
              </li>
            ))}
          </ul>

          <div className="px-5 pb-5">
            <button
              onClick={() => handlePurchase("unlock")}
              disabled={!!pending}
              className="w-full py-3.5 rounded-xl font-display font-bold text-base uppercase
                         tracking-tight border-4 border-black bg-white
                         shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
                         active:translate-x-1 active:translate-y-1 active:shadow-none
                         disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {pending === "unlock" ? "Opening checkout…" : "Get Unlock Forever"}
            </button>
          </div>
        </div>

        {/* ── Pro Stylist card ─────────────────────────────────────────────── */}
        <div className="border-4 border-black rounded-2xl bg-black text-white
                        shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] overflow-hidden relative">
          {/* Best value badge */}
          <div className="absolute top-4 right-4">
            <span className="bg-primary text-black font-display font-bold text-[10px]
                             uppercase tracking-wide px-2 py-0.5 rounded-full border-2 border-black">
              Best Value
            </span>
          </div>

          <div className="px-5 pt-5 pb-4">
            <p className="font-display font-bold text-2xl uppercase tracking-tight leading-none">
              👗 Pro Stylist
            </p>
            <p className="font-display font-bold text-4xl mt-1 leading-none">$9.99</p>
            <p className="text-xs font-bold text-white/50 mt-1">
              One-time · No subscription
            </p>
          </div>

          <div className="border-t-2 border-white/15 mx-5" />

          <ul className="px-5 py-4 flex flex-col gap-2">
            {PRO_FEATURES.map((text) => (
              <li key={text} className="flex items-start gap-2 text-sm leading-snug">
                <span className="mt-0.5 w-4 h-4 border-2 border-white/60 rounded-sm flex-shrink-0
                                 flex items-center justify-center bg-white/10">
                  <Check className="w-2.5 h-2.5 text-primary" strokeWidth={3} />
                </span>
                <span className="text-white/85">{text}</span>
              </li>
            ))}
          </ul>

          <div className="px-5 pb-5">
            <button
              onClick={() => handlePurchase("premium")}
              disabled={!!pending}
              className="w-full py-3.5 rounded-xl font-display font-bold text-base uppercase
                         tracking-tight border-4 border-white/80 bg-primary text-black
                         shadow-[4px_4px_0px_0px_rgba(255,255,255,0.3)]
                         active:translate-x-1 active:translate-y-1 active:shadow-none
                         disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {pending === "premium" ? "Opening checkout…" : "Get Pro Stylist"}
            </button>
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="px-5 pb-6 pt-3 bg-white border-t-2 border-black flex-shrink-0">
        <button
          onClick={onClose}
          className="w-full text-sm font-bold text-black/40 text-center underline
                     underline-offset-2 hover:text-black/60 transition-colors"
        >
          Maybe Later
        </button>
      </div>
    </motion.div>
  );
}
