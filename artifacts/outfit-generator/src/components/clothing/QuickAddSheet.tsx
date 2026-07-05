/**
 * QuickAddSheet — snap a photo, get background removed automatically,
 * preview the result, then save it to your closet in one tap.
 *
 * No extra form fields. The user can add details later via ItemDetailsSheet.
 */
import React, { useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, RotateCcw, Check, X, Loader2 } from "lucide-react";
import { useCreateClothingItem, getListClothingQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { processClothingImage } from "@/lib/processImage";

type Category = "tops" | "bottoms" | "shoes" | "accessories" | "outerwear" | "dresses";

const CATEGORY_LABELS: Record<Category, string> = {
  tops: "Top",
  bottoms: "Bottom",
  shoes: "Shoes",
  accessories: "Accessory",
  outerwear: "Outerwear",
  dresses: "Dress",
};

type Phase = "pick" | "processing" | "preview" | "saving";

interface QuickAddSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category;
  /** Number of existing items in this category, for auto-naming */
  existingCount: number;
}

// ── Upload helper (presigned GCS URL, no Uppy dependency) ─────────────────────
async function uploadBlob(blob: Blob, filename: string): Promise<string> {
  const res = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: filename, size: blob.size, contentType: "image/png" }),
  });
  if (!res.ok) throw new Error("Failed to request upload URL");
  const { uploadURL, objectPath } = (await res.json()) as { uploadURL: string; objectPath: string };

  const put = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: blob,
  });
  if (!put.ok) throw new Error("Failed to upload image");

  return objectPath;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function QuickAddSheet({
  open,
  onOpenChange,
  category,
  existingCount,
}: QuickAddSheetProps) {
  const [phase,       setPhase]      = useState<Phase>("pick");
  const [progress,    setProgress]   = useState(0);
  const [previewUrl,  setPreviewUrl] = useState<string | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [errorMsg,    setErrorMsg]   = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const createItem   = useCreateClothingItem();
  const queryClient  = useQueryClient();

  // ── Reset on close/re-open ─────────────────────────────────────────────
  const handleClose = useCallback(() => {
    setPhase("pick");
    setProgress(0);
    setErrorMsg(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setProcessedBlob(null);
    onOpenChange(false);
  }, [previewUrl, onOpenChange]);

  // ── File selected ──────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setPhase("processing");
    setProgress(0);
    setErrorMsg(null);

    try {
      const blob = await processClothingImage(file, (pct) => setProgress(pct));
      const url  = URL.createObjectURL(blob);
      setProcessedBlob(blob);
      setPreviewUrl(url);
      setPhase("preview");
    } catch (err) {
      console.error("processClothingImage failed:", err);
      // Fallback: re-encode the raw photo as PNG via canvas (keeps MIME consistent)
      try {
        const rawUrl = URL.createObjectURL(file);
        const img    = new Image();
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = rej;
          img.src = rawUrl;
        });
        URL.revokeObjectURL(rawUrl);
        const cvs = document.createElement("canvas");
        cvs.width  = img.naturalWidth;
        cvs.height = img.naturalHeight;
        cvs.getContext("2d")!.drawImage(img, 0, 0);
        const pngBlob = await new Promise<Blob>((res, rej) =>
          cvs.toBlob((b) => (b ? res(b) : rej(new Error("canvas toBlob failed"))), "image/png")
        );
        const url = URL.createObjectURL(pngBlob);
        setProcessedBlob(pngBlob);
        setPreviewUrl(url);
        setErrorMsg("Background removal failed. Tap Save to keep the original photo.");
        setPhase("preview");
      } catch {
        setErrorMsg("Could not process this image. Please try a different photo.");
        setPhase("pick");
      }
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so the same file can be re-selected
    e.target.value = "";
  };

  // ── Save ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!processedBlob) return;
    setPhase("saving");

    try {
      const label    = CATEGORY_LABELS[category];
      const n        = existingCount + 1;
      const autoName = n === 1 ? label : `${label} ${n}`;
      const filename = `${category}-${Date.now()}.png`;

      const objectPath = await uploadBlob(processedBlob, filename);

      createItem.mutate(
        { data: { name: autoName, category, imageObjectPath: objectPath } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
            handleClose();
          },
          onError: () => {
            setErrorMsg("Could not save the item. Please try again.");
            setPhase("preview");
          },
        }
      );
    } catch (err) {
      console.error("Upload failed:", err);
      setErrorMsg("Upload failed. Check your connection and try again.");
      setPhase("preview");
    }
  };

  // ── Retake ────────────────────────────────────────────────────────────
  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setProcessedBlob(null);
    setPhase("pick");
    // Re-open file picker
    setTimeout(() => fileInputRef.current?.click(), 100);
  };

  if (!open) return null;

  const label = CATEGORY_LABELS[category];

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[70] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b-2 border-black flex-shrink-0">
        <h2 className="font-display font-bold text-xl uppercase tracking-tight">
          Add {label}
        </h2>
        <button
          onClick={handleClose}
          className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                     bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                     active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        <AnimatePresence mode="wait">

          {/* ── PICK ── */}
          {phase === "pick" && (
            <motion.div
              key="pick"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center gap-6 w-full"
            >
              <div className="text-center">
                <p className="font-display font-bold text-2xl uppercase tracking-tight">
                  Take or Choose a Photo
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Background is removed automatically.
                </p>
              </div>

              {/* Big camera button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-44 h-44 border-4 border-black rounded-3xl bg-primary
                           flex flex-col items-center justify-center gap-3
                           shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]
                           hover:-translate-y-1 hover:shadow-[7px_7px_0px_0px_rgba(0,0,0,1)]
                           active:translate-y-1 active:translate-x-1 active:shadow-none transition-all"
              >
                <Camera className="w-14 h-14" strokeWidth={1.5} />
                <span className="font-display font-bold text-lg uppercase tracking-tight">
                  Open Camera
                </span>
              </button>

              <p className="text-xs text-muted-foreground text-center max-w-xs leading-relaxed">
                Lay your {label.toLowerCase()} flat or hang it up for best results.
                Works with any background.
              </p>
            </motion.div>
          )}

          {/* ── PROCESSING ── */}
          {phase === "processing" && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-6 w-full"
            >
              <div className="w-44 h-44 border-4 border-black rounded-3xl bg-white
                              flex flex-col items-center justify-center gap-3
                              shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <Loader2 className="w-14 h-14 animate-spin" strokeWidth={1.5} />
                <span className="font-display font-bold text-sm uppercase tracking-wide">
                  Removing BG…
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full max-w-xs">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide mb-1 text-black/50">
                  <span>Processing</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-3 bg-black/10 rounded-full border border-black/20 overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                {progress < 30 && (
                  <p className="text-[10px] text-muted-foreground mt-2 text-center">
                    Downloading AI model on first use…
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {/* ── PREVIEW ── */}
          {phase === "preview" && previewUrl && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center gap-5 w-full"
            >
              {/* Transparent PNG preview on a checkerboard */}
              <div
                className="w-52 h-52 border-4 border-black rounded-2xl overflow-hidden flex-shrink-0"
                style={{
                  backgroundImage:
                    "repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)",
                  backgroundSize: "20px 20px",
                }}
              >
                <img
                  src={previewUrl}
                  alt="Processed preview"
                  className="w-full h-full object-contain"
                />
              </div>

              {errorMsg ? (
                <p className="text-sm font-medium text-center text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {errorMsg}
                </p>
              ) : (
                <p className="text-sm font-medium text-center text-muted-foreground">
                  Background removed. Does it look right?
                </p>
              )}

              <div className="flex gap-3 w-full max-w-xs">
                <button
                  onClick={handleRetake}
                  className="flex-1 py-3 rounded-xl flex items-center justify-center gap-2
                             font-bold uppercase text-sm border-2 border-black bg-white
                             shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                             active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                  Retake
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 py-3 rounded-xl flex items-center justify-center gap-2
                             font-bold uppercase text-sm border-2 border-black bg-primary
                             shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                             active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
                >
                  <Check className="w-4 h-4" />
                  Save
                </button>
              </div>
            </motion.div>
          )}

          {/* ── SAVING ── */}
          {phase === "saving" && (
            <motion.div
              key="saving"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-4"
            >
              <Loader2 className="w-12 h-12 animate-spin" />
              <p className="font-display font-bold text-lg uppercase tracking-tight">
                Saving to Closet…
              </p>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Hidden file input — camera-first on mobile */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />
    </motion.div>
  );
}
