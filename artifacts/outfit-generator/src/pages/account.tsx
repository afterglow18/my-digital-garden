/**
 * Settings / Account page
 *
 * Layout (top to bottom):
 *   1. MY PLAN      — current plan badge, upgrade CTA, restore link
 *   2. BACKUP & RESTORE — export/import with warning text
 *   3. MY DIGITAL GARDEN — app version + tagline
 */
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Upload, RefreshCw, Loader2, Check, AlertTriangle } from "lucide-react";
import { exportBackup, importBackup, pickBackupFile } from "@/lib/backup";
import { useSubscription } from "@/lib/revenuecat";
import { useQueryClient } from "@tanstack/react-query";
import { UpgradeSheet } from "@/components/paywall/UpgradeSheet";
import {
  getListClothingQueryKey,
  getListOutfitsQueryKey,
  getWardrobeStatsQueryKey,
} from "@/hooks/useLocalDB";

// ─── Card shell ───────────────────────────────────────────────────────────────

function Card({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border-[3px] border-black rounded-2xl overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-2 px-4 py-3 border-b-[3px] border-black">
        <span className="text-xl leading-none">{emoji}</span>
        <h2 className="font-display font-bold text-base uppercase tracking-tight">{title}</h2>
      </div>
      <div className="p-4 flex flex-col gap-3">{children}</div>
    </div>
  );
}

// ─── Big green action button ──────────────────────────────────────────────────

function YellowButton({
  onClick,
  pending,
  icon: Icon,
  label,
}: {
  onClick: () => void;
  pending?: boolean;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!!pending}
      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl
                 border-[3px] border-black font-display font-bold text-sm uppercase
                 tracking-tight bg-[#243B24] text-white
                 active:translate-x-0.5 active:translate-y-0.5 transition-all
                 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Icon className="w-4 h-4" />
      )}
      {label}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const qc = useQueryClient();
  const {
    isSubscribed,
    restore,
    isRestoring,
  } = useSubscription();

  const [showUpgrade, setShowUpgrade] = useState(false);

  const [exportPending, setExportPending] = useState(false);
  const [importPending, setImportPending] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const flash = (type: "success" | "error", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4500);
  };

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    setExportPending(true);
    try {
      await exportBackup();
      flash("success", "Backup exported — save it to Files or iCloud Drive.");
    } catch (err) {
      flash("error", err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportPending(false);
    }
  };

  const handleImport = async () => {
    setImportPending(true);
    try {
      const json = await pickBackupFile();
      const result = await importBackup(json);
      await qc.invalidateQueries({ queryKey: getListClothingQueryKey() });
      await qc.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
      await qc.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
      flash(
        "success",
        `Restored ${result.clothingAdded} items and ${result.outfitsAdded} outfits.` +
          (result.skippedItems > 0 ? ` (${result.skippedItems} skipped — already exist.)` : ""),
      );
    } catch (err) {
      flash("error", err instanceof Error ? err.message : "Import failed");
    } finally {
      setImportPending(false);
    }
  };

  const handleRestore = async () => {
    try {
      await restore();
      flash("success", "Purchases restored.");
    } catch (err) {
      flash("error", err instanceof Error ? err.message : "Could not restore");
    }
  };

  return (
    <>
    <div
      className="min-h-full flex flex-col px-4 pb-10"
      style={{ paddingTop: "max(2rem, env(safe-area-inset-top))", background: "#F5F0E8" }}
    >
      {/* Page title */}
      <header className="mb-5">
        <h1 className="font-display font-bold text-4xl uppercase tracking-tighter leading-none">
          My Digital<br />Garden
        </h1>
      </header>

      {/* Flash message */}
      <AnimatePresence>
        {msg && (
          <motion.div
            key="msg"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={`mb-4 px-4 py-3 rounded-xl border-2 border-black text-sm font-medium flex items-start gap-2
              ${msg.type === "success" ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}
          >
            {msg.type === "success"
              ? <Check className="w-4 h-4 shrink-0 mt-0.5" />
              : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
            {msg.text}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-4">

        {/* ── 1. MY PLAN ──────────────────────────────────────────────────── */}
        <Card emoji="👑" title="My Plan">
          {/* Current plan row */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-black/70">Current plan</span>
            <span
              className="text-sm font-bold px-3 py-0.5 rounded-full border-2 border-black"
              style={{ background: isSubscribed ? "#F5C842" : "transparent" }}
            >
              {isSubscribed ? "Pro" : "Free"}
            </span>
          </div>

          {!isSubscribed && (
            <YellowButton
              onClick={() => setShowUpgrade(true)}
              icon={() => null}
              label="Lifetime Unlock — $9.99"
            />
          )}

          {/* Restore link */}
          <button
            onClick={handleRestore}
            disabled={isRestoring}
            className="flex items-center justify-center gap-1.5 text-sm font-medium text-black/50
                       hover:text-black/70 transition-colors mx-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {isRestoring ? "Restoring…" : "Restore Purchases"}
          </button>
        </Card>

        {/* ── 2. BACKUP & RESTORE ─────────────────────────────────────────── */}
        <Card emoji="💾" title="Backup & Restore">
          <p className="text-sm text-black/60 leading-snug">
            Export your garden to a file. Save it to iCloud Drive or Files to
            keep it safe across device upgrades.
          </p>

          <YellowButton
            onClick={handleExport}
            pending={exportPending}
            icon={Download}
            label="Export Backup"
          />

          {/* Warning */}
          <p className="text-sm font-bold leading-snug" style={{ color: "#C0390B" }}>
            ⚠️ Deleting the app removes all your garden data.
            Export a backup first to keep it safe.
          </p>

          <YellowButton
            onClick={handleImport}
            pending={importPending}
            icon={Upload}
            label="Import Backup"
          />

          <p className="text-xs text-black/40 text-center leading-snug">
            Importing replaces your current garden with the backup.
          </p>
        </Card>

        {/* ── 3. APP INFO ─────────────────────────────────────────────────── */}
        <Card emoji="🌿" title="My Digital Garden">
          <p className="text-sm text-black/55 leading-snug">
            Version 1.0.0
          </p>
          <p className="text-sm text-black/55 leading-snug">
            Your garden stays on your device, works offline, and can be
            backed up with iCloud.
          </p>
        </Card>

      </div>
    </div>

    <AnimatePresence>
      {showUpgrade && (
        <UpgradeSheet reason="items" onClose={() => setShowUpgrade(false)} />
      )}
    </AnimatePresence>
    </>
  );
}
