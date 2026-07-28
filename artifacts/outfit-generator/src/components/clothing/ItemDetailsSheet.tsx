/**
 * ItemDetailsSheet — full-screen overlay showing a clothing item's details.
 *
 * "Clean Up Photo" flow:
 *   1. User taps "Clean Up Photo" — overlay slides up immediately.
 *   2. Existing stored image is passed to @imgly/background-removal (WASM, on-device).
 *   3. Overlay shows Original (left) + Cleaned (right) side-by-side; pink ring = selected.
 *   4. User taps "Save Original" or "Save Cleaned Version".
 *   5. Chosen URL is written to displayImagePath immediately (optimistic), then the DB
 *      mutation fires in the background.  No flash back to old photo while writing.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Heart, Trash2, Save, ChevronDown,
  ImagePlus, Loader2, Check, RotateCcw, Sparkles,
} from "lucide-react";
import {
  type ClothingItem,
  type ClothingItemUpdateCategory,
  useUpdateClothingItem,
  useDeleteClothingItem,
  getListClothingQueryKey,
  getListOutfitsQueryKey,
  getWardrobeStatsQueryKey,
} from "@/hooks/useLocalDB";
import { useQueryClient } from "@tanstack/react-query";
import { getImageUrl } from "@/lib/utils";
import {
  removeBackground,
  blobToDataUrl,
  dataUrlToBlob,
} from "@/lib/backgroundRemoval";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEASON_OPTIONS   = ["", "Spring", "Summer", "Fall", "Winter", "All Season"];
const OCCASION_OPTIONS = ["", "Casual", "Work", "Formal", "Sport", "Special Event"];
const CATEGORY_OPTIONS = ["tools", "landscaping", "decor", "plants"];

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-[#8A6A3A]/65">{label}</label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className="w-full border border-[#C8B870]/45 rounded-lg px-3 py-2 text-sm font-medium
                   bg-[#faf8f2] focus:outline-none focus:ring-2 focus:ring-[#C8B870]/20
                   placeholder:font-normal placeholder:text-black/25"
      />
    </div>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-[#8A6A3A]/65">{label}</label>
      <div className="relative">
        <select
          value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none border border-[#C8B870]/45 rounded-lg px-3 py-2 pr-8
                     text-sm font-medium bg-[#faf8f2] focus:outline-none focus:ring-2 focus:ring-[#C8B870]/20 cursor-pointer"
        >
          {options.map((o) => <option key={o} value={o}>{o || `— ${label} —`}</option>)}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-black/40" />
      </div>
    </div>
  );
}

/** Resize + JPEG-encode a File/Blob to ≤2048 px. */
async function encodeForUpload(input: File | Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(input);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX = 2048;
      const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (b) => (b && b.size > 1000 ? resolve(b) : reject(new Error("blank image"))),
        "image/jpeg", 0.85,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("failed to load image")); };
    img.src = objectUrl;
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ItemDetailsSheetProps {
  item: ClothingItem | null;
  onClose: () => void;
  onDeleted?: () => void;
}

interface FormState {
  name: string; brand: string; color: string; size: string;
  season: string; occasion: string; purchasePrice: string;
  purchaseDate: string; notes: string; isFavorite: boolean; category: string;
}

function toForm(item: ClothingItem): FormState {
  return {
    name:          item.name          ?? "",
    brand:         item.brand         ?? "",
    color:         item.color         ?? "",
    size:          item.size          ?? "",
    season:        item.season        ?? "",
    occasion:      item.occasion      ?? "",
    purchasePrice: item.purchasePrice ?? "",
    purchaseDate:  item.purchaseDate  ?? "",
    notes:         item.notes         ?? "",
    isFavorite:    item.isFavorite    ?? false,
    category:      item.category      ?? "",
  };
}

function isDirty(form: FormState, item: ClothingItem, hasNewFile: boolean): boolean {
  return (
    hasNewFile ||
    form.name          !== (item.name          ?? "") ||
    form.brand         !== (item.brand         ?? "") ||
    form.color         !== (item.color         ?? "") ||
    form.size          !== (item.size          ?? "") ||
    form.season        !== (item.season        ?? "") ||
    form.occasion      !== (item.occasion      ?? "") ||
    form.purchasePrice !== (item.purchasePrice ?? "") ||
    form.purchaseDate  !== (item.purchaseDate  ?? "") ||
    form.notes         !== (item.notes         ?? "") ||
    form.isFavorite    !== (item.isFavorite    ?? false) ||
    form.category      !== (item.category      ?? "")
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ItemDetailsSheet({ item, onClose, onDeleted }: ItemDetailsSheetProps) {
  const [form, setForm]             = useState<FormState | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Optimistically-updated display photo.
  // Starts null (falls back to item.imageObjectPath); set immediately on confirm.
  const [displayImagePath, setDisplayImagePath] = useState<string | null>(null);

  // ── "Replace Photo" — pick a new file ────────────────────────────────────
  const [newFilePath,   setNewFilePath]   = useState<string | null>(null);
  const [replacePhase,  setReplacePhase]  = useState<"idle" | "encoding" | "preview">("idle");
  const [repOrigBlob,   setRepOrigBlob]   = useState<Blob | null>(null);
  const [repOrigUrl,    setRepOrigUrl]    = useState<string | null>(null);
  const [repCleanBlob,  setRepCleanBlob]  = useState<Blob | null>(null);
  const [repCleanUrl,   setRepCleanUrl]   = useState<string | null>(null);
  const [repProcessing, setRepProcessing] = useState(false);
  const [repFailed,     setRepFailed]     = useState(false);
  const [repSelected,   setRepSelected]   = useState<"original" | "cleaned">("original");
  const repGenRef    = useRef(0);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const resetReplaceState = useCallback(() => {
    repGenRef.current += 1;
    setNewFilePath(null);
    setReplacePhase("idle");
    setRepOrigBlob(null); setRepOrigUrl(null);
    setRepCleanBlob(null); setRepCleanUrl(null);
    setRepProcessing(false); setRepFailed(false);
    setRepSelected("original");
  }, []);

  const handleReplaceFile = useCallback(async (file: File) => {
    const myGen = ++repGenRef.current;
    setNewFilePath(null);
    setRepOrigBlob(null); setRepOrigUrl(null);
    setRepCleanBlob(null); setRepCleanUrl(null);
    setRepFailed(false); setRepProcessing(false); setRepSelected("original");
    setReplacePhase("encoding");

    let jpeg: Blob;
    try { jpeg = await encodeForUpload(file); }
    catch { if (repGenRef.current === myGen) setReplacePhase("idle"); return; }
    if (repGenRef.current !== myGen) return;

    setRepOrigBlob(jpeg);
    setRepOrigUrl(URL.createObjectURL(jpeg));
    setReplacePhase("preview");

    setRepProcessing(true);
    try {
      const dataUrl   = await blobToDataUrl(jpeg);
      if (repGenRef.current !== myGen) return;
      const resultUrl = await removeBackground(dataUrl);
      if (repGenRef.current !== myGen) return;
      const resultBlob   = await dataUrlToBlob(resultUrl);
      const resultObjUrl = URL.createObjectURL(resultBlob);
      if (repGenRef.current !== myGen) { URL.revokeObjectURL(resultObjUrl); return; }
      setRepCleanBlob(resultBlob);
      setRepCleanUrl(resultObjUrl);
      setRepSelected("cleaned");
    } catch {
      if (repGenRef.current === myGen) setRepFailed(true);
    } finally {
      if (repGenRef.current === myGen) setRepProcessing(false);
    }
  }, []);

  const handleConfirmReplace = useCallback(async () => {
    const blob = repSelected === "cleaned" && repCleanBlob ? repCleanBlob : repOrigBlob;
    if (!blob) return;
    const dataUrl = await blobToDataUrl(blob);
    setNewFilePath(dataUrl);
    setReplacePhase("idle");
  }, [repSelected, repCleanBlob, repOrigBlob]);

  // ── "Clean Up Photo" — bg-remove the existing stored image ───────────────
  const [cleanUpOpen,    setCleanUpOpen]    = useState(false);
  const [cleanedUrl,     setCleanedUrl]     = useState<string | null>(null);
  const [cleanProcessing,setCleanProcessing]= useState(false);
  const [cleanFailed,    setCleanFailed]    = useState(false);
  const [cleanSelected,  setCleanSelected]  = useState<"original" | "cleaned">("original");
  const cleanGenRef    = useRef(0);
  // True once the user explicitly taps a card — prevents auto-select from
  // overriding a deliberate "Original" choice made while processing is running.
  const cleanUserChosen = useRef(false);

  const handleStartCleanUp = useCallback(async () => {
    const currentPath = displayImagePath ?? item?.imageObjectPath;
    if (!currentPath) return;
    const myGen = ++cleanGenRef.current;
    cleanUserChosen.current = false;
    setCleanedUrl(null);
    setCleanFailed(false);
    setCleanSelected("original");
    setCleanProcessing(true);
    setCleanUpOpen(true);

    try {
      const src = getImageUrl(currentPath) ?? currentPath;
      const resultUrl = await removeBackground(src);
      if (cleanGenRef.current !== myGen) return;
      setCleanedUrl(resultUrl);
      // Only auto-select cleaned if the user hasn't already made a choice
      if (!cleanUserChosen.current) setCleanSelected("cleaned");
    } catch {
      if (cleanGenRef.current === myGen) setCleanFailed(true);
    } finally {
      if (cleanGenRef.current === myGen) setCleanProcessing(false);
    }
  }, [displayImagePath, item]);

  const handleConfirmCleanUp = useCallback(() => {
    const originalPath = displayImagePath ?? item!.imageObjectPath;
    const chosen = cleanSelected === "cleaned" && cleanedUrl ? cleanedUrl : originalPath;
    if (!chosen) return;

    // 1. Optimistic — update the displayed photo immediately; no flash.
    setDisplayImagePath(chosen);
    setCleanUpOpen(false);

    // 2. Persist in background — don't await.
    updateItem.mutate(
      { id: item!.id, data: { imageObjectPath: chosen } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
        },
      },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanSelected, cleanedUrl, displayImagePath, item]);

  const handleCancelCleanUp = useCallback(() => {
    cleanGenRef.current += 1; // cancel in-flight removal
    cleanUserChosen.current = false;
    setCleanUpOpen(false);
    setCleanedUrl(null);
    setCleanFailed(false);
    setCleanProcessing(false);
    setCleanSelected("original");
  }, []);

  // ── DB hooks ─────────────────────────────────────────────────────────────
  const updateItem  = useUpdateClothingItem();
  const deleteItem  = useDeleteClothingItem();
  const queryClient = useQueryClient();

  // Reset everything when the item changes
  useEffect(() => {
    if (item) setForm(toForm(item));
    setShowDeleteConfirm(false);
    setDisplayImagePath(null);
    resetReplaceState();
    // Also cancel any in-flight clean-up
    cleanGenRef.current += 1;
    setCleanUpOpen(false);
    setCleanedUrl(null);
    setCleanFailed(false);
    setCleanProcessing(false);
    setCleanSelected("original");
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item || !form) return null;

  const dirty = isDirty(form, item, newFilePath !== null);
  const patch  = (key: keyof FormState) => (value: string | boolean) =>
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);

  // All uploads are JPEG-encoded; removeBackground() always returns PNG.
  // So data:image/png = already cleaned — hide the Clean Up button.
  const currentPhotoPath = displayImagePath ?? item.imageObjectPath;
  const alreadyCleaned = !!currentPhotoPath && currentPhotoPath.startsWith("data:image/png");

  // The photo src to actually render in the sheet (optimistic path wins)
  const shownImageSrc = displayImagePath
    ? (getImageUrl(displayImagePath) ?? displayImagePath)
    : (item.imageObjectPath ? getImageUrl(item.imageObjectPath) : null);

  const hasPhoto = !!(displayImagePath || item.imageObjectPath);

  const handleSave = () => {
    updateItem.mutate(
      {
        id: item.id,
        data: {
          name:          form.name.trim() || item.name,
          brand:         form.brand.trim(),
          color:         form.color.trim(),
          size:          form.size.trim(),
          season:        form.season,
          occasion:      form.occasion,
          purchasePrice: form.purchasePrice.trim(),
          purchaseDate:  form.purchaseDate.trim(),
          notes:         form.notes.trim(),
          isFavorite:    form.isFavorite,
          category:      (form.category || item.category) as ClothingItemUpdateCategory,
          ...(newFilePath ? { imageObjectPath: newFilePath } : {}),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
          onClose();
        },
      },
    );
  };

  const handleDelete = () => {
    deleteItem.mutate(
      { id: item.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
          onDeleted?.();
          onClose();
        },
      },
    );
  };

  return (
    <>
      {/* ── Main sheet ── */}
      <motion.div
        initial={{ opacity: 0, y: "100%" }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 240 }}
        className="fixed inset-0 md:left-[220px] z-[65] flex flex-col max-w-md mx-auto bg-[#f9f4ee] overflow-y-auto"
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-4
                     bg-[#f9f4ee] border-b border-[#C8B870]/30 flex-shrink-0"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
        >
          <h2 className="font-display font-bold text-xl uppercase tracking-tight">Item Details</h2>
          <div className="flex items-center gap-2">
            {/* Favourite — saves instantly */}
            <button
              onClick={() => {
                const next = !form.isFavorite;
                patch("isFavorite")(next);
                updateItem.mutate(
                  { id: item.id, data: { isFavorite: next } },
                  { onSuccess: () => {
                    queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
                    queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
                    queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
                  }},
                );
              }}
              className={`w-9 h-9 border rounded-full flex items-center justify-center transition-all
                          ${form.isFavorite
                            ? "bg-red-400 border-red-300"
                            : "bg-[#faf8f2] border-[#C8B870]/45"}`}
            >
              <Heart className="w-4 h-4"
                fill={form.isFavorite ? "white" : "none"}
                stroke={form.isFavorite ? "white" : "currentColor"} />
            </button>
            {/* Close */}
            <button
              onClick={onClose}
              className="w-9 h-9 border border-[#C8B870]/45 rounded-full flex items-center justify-center
                         bg-[#faf8f2] active:bg-[#f0e8d8] transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Photo section ── */}
        <div className="flex-shrink-0 border-b border-[#C8B870]/30">

          {/* Replace-file: encoding spinner */}
          {replacePhase === "encoding" && (
            <div className="w-full h-44 flex items-center justify-center bg-black/5">
              <Loader2 className="w-10 h-10 animate-spin opacity-40" />
            </div>
          )}

          {/* Replace-file: side-by-side preview */}
          {replacePhase === "preview" && (
            <div className="flex flex-col gap-3 p-4">
              <p className="text-center font-bold text-[10px] uppercase tracking-widest opacity-40">
                {repProcessing ? "Removing background…" : repFailed ? "Original only" : "Tap to choose"}
              </p>
              <div className="flex gap-3">
                {/* Original */}
                <button
                  onClick={() => setRepSelected("original")}
                  className="flex-1 flex flex-col overflow-hidden rounded-2xl transition-all"
                  style={{ border: repSelected === "original" ? "4px solid black" : "4px solid rgba(0,0,0,0.2)", background: "none", padding: 0 }}
                >
                  <div className="relative bg-black" style={{ minHeight: 140 }}>
                    {repOrigUrl && <img src={repOrigUrl} alt="Original" className="w-full object-contain block" style={{ maxHeight: 140 }} />}
                    {repSelected === "original" && (
                      <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black flex items-center justify-center">
                        <Check size={12} color="white" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <p className="text-center font-bold text-xs uppercase tracking-widest py-1.5">Original</p>
                </button>
                {/* Cleaned */}
                <button
                  onClick={() => repCleanUrl && setRepSelected("cleaned")}
                  disabled={!repCleanUrl}
                  className="flex-1 flex flex-col overflow-hidden rounded-2xl transition-all"
                  style={{ border: repSelected === "cleaned" && repCleanUrl ? "4px solid black" : "4px solid rgba(0,0,0,0.2)", background: "none", padding: 0 }}
                >
                  <div className="relative flex items-center justify-center"
                    style={{ background: "repeating-conic-gradient(#d1d5db 0% 25%, white 0% 50%) 0 0 / 12px 12px", minHeight: 140 }}>
                    {repCleanUrl ? (
                      <>
                        <img src={repCleanUrl} alt="Cleaned" className="w-full object-contain block" style={{ maxHeight: 140 }} />
                        {repSelected === "cleaned" && (
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black flex items-center justify-center">
                            <Check size={12} color="white" strokeWidth={3} />
                          </div>
                        )}
                      </>
                    ) : repFailed ? (
                      <p className="text-xs font-bold uppercase opacity-40 text-center px-3">Could not remove background</p>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 size={28} className="animate-spin opacity-50" />
                        <p className="text-xs font-bold uppercase opacity-50">Processing</p>
                      </div>
                    )}
                  </div>
                  <p className="text-center font-bold text-xs uppercase tracking-widest py-1.5">Cleaned ✨</p>
                </button>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={resetReplaceState}
                  className="flex items-center justify-center gap-2 px-4 py-3
                             border border-[#C8B870]/45 rounded-xl bg-[#faf8f2] font-bold text-sm uppercase
                             active:bg-[#f0e8d8] transition-all"
                >
                  <RotateCcw className="w-4 h-4" /> Retake
                </button>
                <button
                  onClick={handleConfirmReplace}
                  disabled={repProcessing}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3
                             border border-[#B8894E] rounded-xl font-bold text-sm uppercase
                             active:opacity-80 transition-all
                             disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(to bottom, #E8D4B0, #B8894E)", color: "#3A2210" }}
                >
                  <Check className="w-4 h-4" />
                  {repProcessing ? "Processing…" : "Use This Photo"}
                </button>
              </div>
            </div>
          )}

          {/* Idle — current photo + action buttons */}
          {replacePhase === "idle" && (
            <>
              {hasPhoto && shownImageSrc ? (
                <div
                  className="relative w-full h-52"
                  style={{
                    backgroundImage: "repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)",
                    backgroundSize: "16px 16px",
                  }}
                >
                  <img src={shownImageSrc} alt={item.name} className="w-full h-full object-contain" />

                  {/* Bottom-right action pill */}
                  <div className="absolute bottom-2 right-2 flex gap-1.5">
                    {/* Clean Up Photo — hidden once photo is already a PNG (already cleaned) */}
                    {!alreadyCleaned && (
                      <button
                        onClick={handleStartCleanUp}
                        className="flex items-center gap-1.5 px-3 py-1.5
                                   bg-pink-500 border border-pink-400 rounded-xl text-white text-xs font-bold uppercase
                                   shadow-[1px_1px_0px_0px_rgba(190,24,93,0.5)]
                                   active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
                      >
                        <Sparkles className="w-3 h-3" /> Clean Up
                      </button>
                    )}
                    {/* Replace (pick new file) */}
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5
                                 bg-[#faf8f2] border border-[#C8B870]/45 rounded-xl text-xs font-bold uppercase
                                 active:bg-[#f0e8d8] transition-all"
                    >
                      <RotateCcw className="w-3 h-3" /> Replace
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className="w-full h-36 flex flex-col items-center justify-center gap-2
                             bg-black/5 border-dashed border-2 border-black/20
                             active:bg-black/10 transition-colors"
                >
                  <ImagePlus className="w-8 h-8 opacity-30" />
                  <span className="text-xs font-bold uppercase opacity-30">Add Photo</span>
                </button>
              )}
            </>
          )}

          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleReplaceFile(file);
              e.target.value = "";
            }}
          />
        </div>

        {/* ── Form fields ── */}
        <div className="flex-1 px-4 py-5 flex flex-col gap-4">
          <Field label="Item Name" value={form.name}
            onChange={patch("name") as (v: string) => void} placeholder="e.g. White Linen Shirt" />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand" value={form.brand} onChange={patch("brand") as (v: string) => void} placeholder="Nike, Zara…" />
            <Field label="Color" value={form.color} onChange={patch("color") as (v: string) => void} placeholder="Navy Blue" />
          </div>

          <Field label="Size / Volume" value={form.size}
            onChange={patch("size") as (v: string) => void} placeholder="30ml, 50ml, Full Size…" />

          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Season"   value={form.season}   onChange={patch("season") as (v: string) => void}   options={SEASON_OPTIONS} />
            <SelectField label="Occasion" value={form.occasion} onChange={patch("occasion") as (v: string) => void} options={OCCASION_OPTIONS} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Purchase Price" value={form.purchasePrice}
              onChange={patch("purchasePrice") as (v: string) => void} placeholder="$49.99" />
            <Field label="Purchase Date"  value={form.purchaseDate}
              onChange={patch("purchaseDate") as (v: string) => void} type="date" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Notes</label>
            <textarea
              value={form.notes} onChange={(e) => patch("notes")(e.target.value)}
              placeholder="Anything worth remembering…" rows={3}
              className="w-full border border-[#C8B870]/45 rounded-lg px-3 py-2 text-sm font-medium
                         bg-[#faf8f2] focus:outline-none focus:ring-2 focus:ring-[#C8B870]/20 resize-none
                         placeholder:font-normal placeholder:text-black/25"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Category" value={form.category}
              onChange={patch("category") as (v: string) => void} options={CATEGORY_OPTIONS} />
            <div className="flex flex-col gap-1 opacity-50 pointer-events-none">
              <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">Times Worn</span>
              <div className="border border-[#C8B870]/30 rounded-lg px-3 py-2 text-sm font-medium bg-[#faf8f2]/50">
                {item.timesWorn ?? 0}
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="sticky bottom-0 px-4 py-4 bg-[#f9f4ee] border-t border-[#C8B870]/30 flex-shrink-0 flex flex-col gap-2">
          <AnimatePresence>
            {dirty && (
              <motion.button
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                onClick={handleSave} disabled={updateItem.isPending}
                className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-bold uppercase"
                style={{
                  background: "linear-gradient(to bottom, #E8D4B0, #B8894E)",
                  border: "1.5px solid #B8894E",
                  color: "#3A2210",
                  boxShadow: "2px 2px 0 rgba(0,0,0,0.45)",
                }}
              >
                <Save className="w-4 h-4" />
                {updateItem.isPending ? "Saving…" : "Save Changes"}
              </motion.button>
            )}
          </AnimatePresence>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm
                         font-bold uppercase border border-[#C8B870]/30 text-black/35
                         hover:border-red-400 hover:text-red-500 transition-all"
            >
              <Trash2 className="w-4 h-4" /> Delete from Garden Forever
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3 rounded-xl text-sm font-bold uppercase border border-[#C8B870]/40 bg-[#faf8f2]
                           active:bg-[#f0e8d8] transition-all"
              >Cancel</button>
              <button
                onClick={handleDelete} disabled={deleteItem.isPending}
                className="flex-1 py-3 rounded-xl text-sm font-bold uppercase border border-red-400
                           bg-red-500 text-white active:opacity-80 transition-all
                           disabled:opacity-50"
              >
                {deleteItem.isPending ? "Deleting…" : "Yes, Delete Forever"}
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Clean Up Photo overlay — slides up over the sheet ── */}
      <AnimatePresence>
        {cleanUpOpen && (
          <motion.div
            key="cleanup-overlay"
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 240 }}
            className="fixed inset-0 md:left-[220px] z-[75] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
          >
            {/* Overlay header */}
            <div
              className="flex items-center justify-between px-4 bg-[#f9f4ee] border-b border-[#C8B870]/30 flex-shrink-0"
              style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
            >
              <h2 className="font-display font-bold text-xl uppercase tracking-tight flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-pink-500" /> Clean Up Photo
              </h2>
              <button
                onClick={handleCancelCleanUp}
                className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                           bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                           active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 flex flex-col gap-5 p-5 overflow-y-auto">
              <p className="text-center font-bold text-[11px] uppercase tracking-widest opacity-40">
                {cleanProcessing
                  ? "Removing background — this takes a moment…"
                  : cleanFailed
                    ? "Could not remove background — tap Original to keep as-is"
                    : "Tap to select, then save"}
              </p>

              {/* Side-by-side cards */}
              <div className="flex gap-3">
                {/* Original */}
                <button
                  onClick={() => { cleanUserChosen.current = true; setCleanSelected("original"); }}
                  className="flex-1 flex flex-col overflow-hidden rounded-2xl transition-all"
                  style={{ padding: 0, background: "none",
                    outline: cleanSelected === "original" ? "4px solid rgb(236,72,153)" : "4px solid rgba(0,0,0,0.15)",
                    outlineOffset: "-4px" }}
                >
                  <div
                    className="relative flex items-center justify-center bg-black"
                    style={{ minHeight: 220 }}
                  >
                    {shownImageSrc && (
                      <img src={shownImageSrc} alt="Original"
                        className="w-full object-contain block" style={{ maxHeight: 220 }} />
                    )}
                    {cleanSelected === "original" && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-pink-500 flex items-center justify-center">
                        <Check size={14} color="white" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <p className="text-center font-bold text-xs uppercase tracking-widest py-2">Original</p>
                </button>

                {/* Cleaned */}
                <button
                  onClick={() => { if (cleanedUrl) { cleanUserChosen.current = true; setCleanSelected("cleaned"); } }}
                  disabled={!cleanedUrl}
                  className="flex-1 flex flex-col overflow-hidden rounded-2xl transition-all"
                  style={{ padding: 0, background: "none",
                    outline: cleanSelected === "cleaned" && cleanedUrl ? "4px solid rgb(236,72,153)" : "4px solid rgba(0,0,0,0.15)",
                    outlineOffset: "-4px" }}
                >
                  <div
                    className="relative flex items-center justify-center"
                    style={{
                      background: "repeating-conic-gradient(#d1d5db 0% 25%, white 0% 50%) 0 0 / 14px 14px",
                      minHeight: 220,
                    }}
                  >
                    {cleanedUrl ? (
                      <>
                        <img src={cleanedUrl} alt="Cleaned"
                          className="w-full object-contain block" style={{ maxHeight: 220 }} />
                        {cleanSelected === "cleaned" && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-pink-500 flex items-center justify-center">
                            <Check size={14} color="white" strokeWidth={3} />
                          </div>
                        )}
                      </>
                    ) : cleanFailed ? (
                      <p className="text-xs font-bold uppercase opacity-40 text-center px-4">
                        Background removal failed
                      </p>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 size={36} className="animate-spin opacity-40" />
                        <p className="text-xs font-bold uppercase opacity-40">Processing…</p>
                      </div>
                    )}
                  </div>
                  <p className="text-center font-bold text-xs uppercase tracking-widest py-2">Cleaned ✨</p>
                </button>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex-shrink-0 px-5 py-4 bg-[#f9f4ee] border-t border-[#C8B870]/30 flex flex-col gap-2">
              <button
                onClick={handleConfirmCleanUp}
                disabled={cleanSelected === "cleaned" && !cleanedUrl}
                className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-bold uppercase
                           border border-pink-400 bg-pink-500 text-white
                           active:opacity-80 transition-all
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4" />
                {cleanSelected === "cleaned" && !cleanedUrl
                  ? "Processing…"
                  : cleanSelected === "cleaned"
                    ? "Save Cleaned Version"
                    : "Save Original"}
              </button>
              <button
                onClick={handleCancelCleanUp}
                className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-bold uppercase
                           border border-[#C8B870]/30 text-black/40
                           active:bg-[#f0e8d8] transition-all"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
