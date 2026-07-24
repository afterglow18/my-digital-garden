/**
 * LockedScreen — shown when biometric lock is enabled and auth has not yet
 * succeeded (on launch or returning from background).
 */
import React from "react";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";

interface Props {
  onTryAgain: () => void;
  isPending: boolean;
}

export function LockedScreen({ onTryAgain, isPending }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-8"
      style={{ background: "#F5F0E8" }}
    >
      {/* Lock icon */}
      <div
        className="w-20 h-20 rounded-full border-[3px] border-black flex items-center justify-center"
        style={{
          background: "#E8D4B0",
          boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)",
        }}
      >
        <Lock className="w-9 h-9 text-black" strokeWidth={2.5} />
      </div>

      {/* Text */}
      <div className="text-center px-8">
        <h1
          className="font-display font-black text-3xl uppercase tracking-tight leading-none mb-2"
          style={{ color: "#1a0800" }}
        >
          My Garden
        </h1>
        <p className="text-sm font-medium text-black/50">
          Authenticate to continue
        </p>
      </div>

      {/* Try Again button */}
      <button
        onClick={onTryAgain}
        disabled={isPending}
        className="px-8 py-4 rounded-2xl border-[3px] border-black font-display font-bold
                   text-base uppercase tracking-tight transition-all
                   active:translate-x-0.5 active:translate-y-0.5 active:shadow-none
                   disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: "#E8D4B0",
          boxShadow: "3px 3px 0px 0px rgba(0,0,0,1)",
        }}
      >
        {isPending ? "Authenticating…" : "Try Again"}
      </button>
    </motion.div>
  );
}
