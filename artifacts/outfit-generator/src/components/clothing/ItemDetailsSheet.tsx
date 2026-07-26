/**
 * ItemDetailsSheet — full-screen overlay showing a clothing item's details.
 * Every field is optional and editable. A "Save" button appears only when
 * the form is dirty. Delete is always available.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Heart, Trash2, Save, ChevronDown, ImagePlus, Loader2, Check, RotateCcw,
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

const SEASON_OPTIONS    = ["", "Spring", "Summer", "Fall", "Winter", "All Season"];
const OCCASION_OPTIONS  = ["", "Casual", "Work", "Formal", "Sport", "Special Event"];
const CATEGORY_OPTIONS  = ["tools", "landscaping", "decor", "plants"];

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className="w-full border-2 border-black rounded-lg px-3 py-2 text-sm font-medium
                   bg-white focus:outline-none focus:ring-2 focus:ring-primary
                   placeholder:font-normal placeholder:text-black/25"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none border-2 border-black rounded-lg px-3 py-2 pr-8
                     text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary
                     cursor-pointer"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o || `— ${label} —`}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-black/40" />
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Resize + JPEG-encode a file to ≤2048 px on the longest edge.
 */
async function encodeForUpload(input: File | Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(input);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX   = 2048;
      const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const w     = Math.round(img.naturalWidth  * scale);
      const h     = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
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

interface ItemDetailsSheetProps {
  item: ClothingItem | null;
  onClose: () => void;
  onDeleted?: () => void;
}

interface FormState {
  name: string;
  brand: string;
  color: string;
  size: string;
  season: string;
  occasion: string;
  purchasePrice: string;
  purchaseDate: string;
  notes: string;
  isFavorite: boolean;
  category: string;
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

function isDirty(form: FormState, item: ClothingItem, newImagePath: string | null): boolean {
  return (
    newImagePath !== null ||
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

export function ItemDetailsSheet({ item, onClose, onDeleted }: ItemDetailsSheetProps) {
  const [form, setForm]           = useState<FormState | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ── Photo replacement state ──────────────────────────────────────────────────
  const [newImagePath,  setNewImagePath]  = useState<string | null>(null);
  const [bgPhase,       setBgPhase]       = useState<"idle" | "encoding" | "preview">("idle");
  const [originalBlob,  setOriginalBlob]  = useState<Blob | null>(null);
  const [originalUrl,   setOriginalUrl]   = useState<string | null>(null);
  const [cleanedBlob,   setCleanedBlob]   = useState<Blob | null>(null);
  const [cleanedUrl,    setCleanedUrl]    = useState<string | null>(null);
  const [bgProcessing,  setBgProcessing]  = useState(false);
  const [bgFailed,      setBgFailed]      = useState(false);
  const [bgSelected,    setBgSelected]    = useState<"original" | "cleaned">("original");
  const bgGenRef    = useRef(0);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const resetPhotoState = useCallback(() => {
    bgGenRef.current += 1;
    setNewImagePath(null);
    setBgPhase("idle");
    setOriginalBlob(null);
    setOriginalUrl(null);
    setCleanedBlob(null);
    setCleanedUrl(null);
    setBgProcessing(false);
    setBgFailed(false);
    setBgSelected("original");
  }, []);

  const handleFile = useCallback(async (file: File) => {
    const myGen = ++bgGenRef.current;
    setNewImagePath(null);
    setOriginalBlob(null);
    setOriginalUrl(null);
    setCleanedBlob(null);
    setCleanedUrl(null);
    setBgFailed(false);
    setBgProcessing(false);
    setBgSelected("original");
    setBgPhase("encoding");

    let jpeg: Blob;
    try {
      jpeg = await encodeForUpload(file);
    } catch {
      if (bgGenRef.current !== myGen) return;
      setBgPhase("idle");
      return;
    }
    if (bgGenRef.current !== myGen) return;

    setOriginalBlob(jpeg);
    setOriginalUrl(URL.createObjectURL(jpeg));
    setBgPhase("preview");

    setBgProcessing(true);
    try {
      const dataUrl   = await blobToDataUrl(jpeg);
      if (bgGenRef.current !== myGen) return;
      const resultUrl = await removeBackground(dataUrl);
      if (bgGenRef.current !== myGen) return;
      const resultBlob   = await dataUrlToBlob(resultUrl);
      const resultObjUrl = URL.createObjectURL(resultBlob);
      if (bgGenRef.current !== myGen) { URL.revokeObjectURL(resultObjUrl); return; }
      setCleanedBlob(resultBlob);
      setCleanedUrl(resultObjUrl);
      setBgSelected("cleaned");
    } catch {
      if (bgGenRef.current !== myGen) return;
      setBgFailed(true);
    } finally {
      if (bgGenRef.current === myGen) setBgProcessing(false);
    }
  }, []);

  const handleConfirmPhoto = useCallback(async () => {
    const blob = bgSelected === "cleaned" && cleanedBlob ? cleanedBlob : originalBlob;
    if (!blob) return;
    const dataUrl = await blobToDataUrl(blob);
    setNewImagePath(dataUrl);
    setBgPhase("idle");
  }, [bgSelected, cleanedBlob, originalBlob]);

  // ─────────────────────────────────────────────────────────────────────────────

  const updateItem  = useUpdateClothingItem();
  const deleteItem  = useDeleteClothingItem();
  const queryClient = useQueryClient();

  // Reset form + photo state whenever item changes
  useEffect(() => {
    if (item) setForm(toForm(item));
    setShowDeleteConfirm(false);
    resetPhotoState();
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item || !form) return null;

  const dirty = isDirty(form, item, newImagePath);

  const patch = (key: keyof FormState) => (value: string | boolean) =>
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);

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
          ...(newImagePath ? { imageObjectPath: newImagePath } : {}),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
          onClose();
        },
      }
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
      }
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 md:left-[220px] z-[65] flex flex-col max-w-md mx-auto bg-[#f9f4ee] overflow-y-auto"
    >
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4
                      bg-white border-b-2 border-black flex-shrink-0"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}>
        <h2 className="font-display font-bold text-xl uppercase tracking-tight">
          Item Details
        </h2>
        <div className="flex items-center gap-2">
          {/* Favourite toggle — saves instantly */}
          <button
            onClick={() => {
              const next = !form.isFavorite;
              patch("isFavorite")(next);
              updateItem.mutate(
                { id: item.id, data: { isFavorite: next } },
                {
                  onSuccess: () => {
                    queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
                    queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
                    queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
                  },
                }
              );
            }}
            className={`w-9 h-9 border-2 border-black rounded-full flex items-center justify-center transition-all
                        ${form.isFavorite
                          ? "bg-red-500 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                          : "bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"}`}
            title="Favourite"
          >
            <Heart
              className="w-4 h-4"
              fill={form.isFavorite ? "white" : "none"}
              stroke={form.isFavorite ? "white" : "currentColor"}
            />
          </button>
          {/* Close */}
          <button
            onClick={onClose}
            className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                       bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                       active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Photo section ── */}
      <div className="flex-shrink-0 border-b-2 border-black">

        {/* ENCODING spinner */}
        {bgPhase === "encoding" && (
          <div className="w-full h-44 flex items-center justify-center bg-black/5">
            <Loader2 className="w-10 h-10 animate-spin opacity-40" />
          </div>
        )}

        {/* PREVIEW — side-by-side bg removal comparison */}
        {bgPhase === "preview" && (
          <div className="flex flex-col gap-3 p-4">
            <p className="text-center font-bold text-[10px] uppercase tracking-widest opacity-40">
              {bgProcessing ? "Removing background…" : bgFailed ? "Original only" : "Tap to choose"}
            </p>
            <div className="flex gap-3">
              {/* Original */}
              <button
                onClick={() => setBgSelected("original")}
                className="flex-1 flex flex-col overflow-hidden rounded-2xl transition-all"
                style={{ border: bgSelected === "original" ? "4px solid black" : "4px solid rgba(0,0,0,0.2)", background: "none", padding: 0 }}
              >
                <div className="relative bg-black" style={{ minHeight: 140 }}>
                  {originalUrl && <img src={originalUrl} alt="Original" className="w-full object-contain block" style={{ maxHeight: 140 }} />}
                  {bgSelected === "original" && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black flex items-center justify-center">
                      <Check size={12} color="white" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <p className="text-center font-bold text-xs uppercase tracking-widest py-1.5">Original</p>
              </button>
              {/* Cleaned */}
              <button
                onClick={() => cleanedUrl && setBgSelected("cleaned")}
                disabled={!cleanedUrl}
                className="flex-1 flex flex-col overflow-hidden rounded-2xl transition-all"
                style={{ border: bgSelected === "cleaned" && cleanedUrl ? "4px solid black" : "4px solid rgba(0,0,0,0.2)", background: "none", padding: 0 }}
              >
                <div className="relative flex items-center justify-center"
                  style={{ background: "repeating-conic-gradient(#d1d5db 0% 25%, white 0% 50%) 0 0 / 12px 12px", minHeight: 140 }}>
                  {cleanedUrl ? (
                    <>
                      <img src={cleanedUrl} alt="Cleaned" className="w-full object-contain block" style={{ maxHeight: 140 }} />
                      {bgSelected === "cleaned" && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black flex items-center justify-center">
                          <Check size={12} color="white" strokeWidth={3} />
                        </div>
                      )}
                    </>
                  ) : bgFailed ? (
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
            {/* Retake / Use */}
            <div className="flex gap-3">
              <button
                onClick={resetPhotoState}
                className="flex items-center justify-center gap-2 px-4 py-3
                           border-2 border-black rounded-xl bg-white font-bold text-sm uppercase
                           shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                           active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
              >
                <RotateCcw className="w-4 h-4" /> Retake
              </button>
              <button
                onClick={handleConfirmPhoto}
                disabled={bgProcessing}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3
                           border-2 border-black rounded-xl bg-primary font-bold text-sm uppercase
                           shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                           active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4" />
                {bgProcessing ? "Processing…" : "Use This Photo"}
              </button>
            </div>
          </div>
        )}

        {/* IDLE — show current (or newly confirmed) photo + replace button */}
        {bgPhase === "idle" && (
          <>
            {(newImagePath || item.imageObjectPath) ? (
              <div className="relative w-full h-52"
                style={{ backgroundImage: "repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)", backgroundSize: "16px 16px" }}>
                <img
                  src={newImagePath ? getImageUrl(newImagePath)! : getImageUrl(item.imageObjectPath!)!}
                  alt={item.name}
                  className="w-full h-full object-contain"
                />
                {/* Replace overlay button */}
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5
                             bg-white/90 border-2 border-black rounded-xl text-xs font-bold uppercase
                             shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                             active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
                >
                  <RotateCcw className="w-3 h-3" /> Replace
                </button>
              </div>
            ) : (
              /* No photo yet — show an upload placeholder */
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

        {/* Hidden file input */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {/* ── Form ── */}
      <div className="flex-1 px-4 py-5 flex flex-col gap-4">

        {/* Name */}
        <Field
          label="Item Name"
          value={form.name}
          onChange={patch("name") as (v: string) => void}
          placeholder="e.g. White Linen Shirt"
        />

        {/* Brand + Color */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand"  value={form.brand} onChange={patch("brand") as (v: string) => void} placeholder="Nike, Zara…" />
          <Field label="Color"  value={form.color} onChange={patch("color") as (v: string) => void} placeholder="Navy Blue" />
        </div>

        {/* Size */}
        <Field label="Size / Volume" value={form.size} onChange={patch("size") as (v: string) => void} placeholder="30ml, 50ml, Full Size…" />

        {/* Season + Occasion */}
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Season"   value={form.season}   onChange={patch("season") as (v: string) => void}   options={SEASON_OPTIONS} />
          <SelectField label="Occasion" value={form.occasion} onChange={patch("occasion") as (v: string) => void} options={OCCASION_OPTIONS} />
        </div>

        {/* Price + Date */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Purchase Price" value={form.purchasePrice} onChange={patch("purchasePrice") as (v: string) => void} placeholder="$49.99" />
          <Field label="Purchase Date"  value={form.purchaseDate}  onChange={patch("purchaseDate") as (v: string) => void}  type="date" />
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">
            Notes
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => patch("notes")(e.target.value)}
            placeholder="Anything worth remembering…"
            rows={3}
            className="w-full border-2 border-black rounded-lg px-3 py-2 text-sm font-medium
                       bg-white focus:outline-none focus:ring-2 focus:ring-primary resize-none
                       placeholder:font-normal placeholder:text-black/25"
          />
        </div>

        {/* Category (editable) + Times Worn (read-only) */}
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Category"
            value={form.category}
            onChange={patch("category") as (v: string) => void}
            options={CATEGORY_OPTIONS}
          />
          <div className="flex flex-col gap-1 opacity-50 pointer-events-none">
            <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">Times Worn</span>
            <div className="border-2 border-black/20 rounded-lg px-3 py-2 text-sm font-medium bg-white/50">
              {item.timesWorn ?? 0}
            </div>
          </div>
        </div>

      </div>

      {/* ── Footer actions ── */}
      <div className="sticky bottom-0 px-4 py-4 bg-white border-t-2 border-black flex-shrink-0 flex flex-col gap-2">

        {/* Save (only when dirty) */}
        <AnimatePresence>
          {dirty && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={handleSave}
              disabled={updateItem.isPending}
              className="w-full btn-brutalist py-3 rounded-xl flex items-center justify-center gap-2 text-sm"
            >
              <Save className="w-4 h-4" />
              {updateItem.isPending ? "Saving…" : "Save Changes"}
            </motion.button>
          )}
        </AnimatePresence>

        {/* Delete */}
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm
                       font-bold uppercase border-2 border-black/20 text-black/35
                       hover:border-red-500 hover:text-red-600 transition-all"
          >
            <Trash2 className="w-4 h-4" />
            Delete from Garden Forever
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-3 rounded-xl text-sm font-bold uppercase border-2 border-black bg-white
                         shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                         active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteItem.isPending}
              className="flex-1 py-3 rounded-xl text-sm font-bold uppercase border-2 border-red-600
                         bg-red-500 text-white
                         shadow-[2px_2px_0px_0px_rgba(185,28,28,1)]
                         active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all
                         disabled:opacity-50"
            >
              {deleteItem.isPending ? "Deleting…" : "Yes, Delete Forever"}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
