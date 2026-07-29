/**
 * QuickAddSheet
 *
 * Upload flow:
 *   pick ──(file chosen)──► encoding ──► preview (Original | Cleaned ✨) ──► uploading ──► close
 */
import React, { useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { X, Loader2, Check, RotateCcw } from "lucide-react";
import {
  useCreateClothingItem,
  getListClothingQueryKey,
  getWardrobeStatsQueryKey,
} from "@/hooks/useLocalDB";
import { useQueryClient } from "@tanstack/react-query";
import {
  removeBackground,
  blobToDataUrl,
  dataUrlToBlob,
} from "@/lib/backgroundRemoval";

// ── Types ──────────────────────────────────────────────────────────────────────

type Category = "tools" | "landscaping" | "decor" | "plants";

const CATEGORY_LABELS: Record<Category, string> = {
  tools:       "🧤 Tools & Supplies",
  landscaping: "🪨 Landscaping",
  decor:       "🌿 Garden Décor",
  plants:      "🌱 Plants",
};

type Phase = "pick" | "encoding" | "preview" | "uploading";

// ── Helpers (outside component to avoid re-creation) ───────────────────────────

/**
 * Resize and JPEG-encode a File/Blob to ≤2048px on the longest edge.
 * Rejects if the image cannot be loaded or the canvas produces a blank result.
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
        "image/jpeg",
        0.85,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("failed to load image"));
    };
    img.src = objectUrl;
  });
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  category:      Category;
  existingCount: number;
  /** Called with the newly created item after a successful upload. */
  onCreated?:    (item: import("@/lib/db").ClothingItem) => void;
}

const PHOTO_TIPS = [
  "Photograph individual products or bundle multiple items together.",
  "Lay everything flat on a plain background.",
  "Take the photo from directly above.",
  "Keep all items fully in frame.",
] as const;

const CATEGORY_EXAMPLES: Record<string, { emoji: string; items: string[] }> = {
  outfits:    { emoji: "👗", items: ["Tops", "Bottoms", "Shoes", "Swim", "Undergarments", "Dresses", "Accessories"] },
  beauty:     { emoji: "💄", items: ["Makeup", "Skincare", "Hair", "Jewelry", "Nail Polish"] },
  toiletries: { emoji: "🪥", items: ["Shower", "Dental", "Medicine", "Feminine Care", "First Aid"] },
  essentials: { emoji: "🧳", items: ["Travel Docs", "Tech", "Snacks", "Books", "Accessories"] },
};

export function QuickAddSheet({ open, onOpenChange, category, existingCount, onCreated }: Props) {
  const [phase,        setPhase]        = useState<Phase>("pick");
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [originalUrl,  setOriginalUrl]  = useState<string | null>(null);
  const [cleanedBlob,  setCleanedBlob]  = useState<Blob | null>(null);
  const [cleanedUrl,   setCleanedUrl]   = useState<string | null>(null);
  const [bgProcessing, setBgProcessing] = useState(false);
  const [bgFailed,     setBgFailed]     = useState(false);
  const [selected,     setSelected]     = useState<"original" | "cleaned">("original");

  // Each photo pick bumps this counter. Every async step checks it before writing state —
  // prevents a slow first photo from clobbering a fast second one.
  const bgGenRef = useRef(0);

  // Multi-photo queue (gallery "multiple" picks)
  const fileQueueRef = useRef<File[]>([]);
  const [queuePos,   setQueuePos]   = useState(0); // 1-based position of current photo
  const [queueTotal, setQueueTotal] = useState(0);

  const cameraInputRef  = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const createItem  = useCreateClothingItem();
  const queryClient = useQueryClient();

  // ── Reset ──────────────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    bgGenRef.current += 1;   // cancels any in-flight removal
    setBgProcessing(false);  // MUST reset — close can happen mid-removal
    setPhase("pick");
    setErrorMsg(null);
    setOriginalBlob(null);
    setOriginalUrl(null);
    setCleanedBlob(null);
    setCleanedUrl(null);
    setBgFailed(false);
    setSelected("original");
    fileQueueRef.current = [];
    setQueuePos(0);
    setQueueTotal(0);
    onOpenChange(false);
  }, [onOpenChange]);

  // ── Pick & encode one photo, then run background removal ──────────────────
  const handleFile = useCallback(async (file: File | Blob) => {
    setErrorMsg(null);
    // Switch to "encoding" BEFORE any async work so the user sees a spinner
    // immediately instead of sitting on the pick screen for 1–3 s.
    const myGen = ++bgGenRef.current;
    setOriginalBlob(null);
    setOriginalUrl(null);
    setCleanedBlob(null);
    setCleanedUrl(null);
    setBgFailed(false);
    setBgProcessing(false);
    setSelected("original");
    setPhase("encoding");

    // Encode to JPEG ≤ 2048 px
    let jpeg: Blob;
    try {
      jpeg = await encodeForUpload(file);
    } catch (err) {
      if (bgGenRef.current !== myGen) return;
      setErrorMsg(`Could not read the photo: ${err instanceof Error ? err.message : String(err)}`);
      setPhase("pick");
      return;
    }
    if (bgGenRef.current !== myGen) return;

    // Show original and switch to comparison screen
    setOriginalBlob(jpeg);
    setOriginalUrl(URL.createObjectURL(jpeg));
    setPhase("preview");

    // Background removal — generation guard discards stale results
    setBgProcessing(true);
    try {
      const dataUrl = await blobToDataUrl(jpeg);
      if (bgGenRef.current !== myGen) return;
      const resultUrl = await removeBackground(dataUrl);
      if (bgGenRef.current !== myGen) return;
      const resultBlob   = await dataUrlToBlob(resultUrl);
      const resultObjUrl = URL.createObjectURL(resultBlob);
      if (bgGenRef.current !== myGen) { URL.revokeObjectURL(resultObjUrl); return; }
      setCleanedBlob(resultBlob);
      setCleanedUrl(resultObjUrl);
      setSelected("cleaned");
    } catch (err) {
      if (bgGenRef.current !== myGen) return;
      console.warn("Background removal failed:", err);
      setBgFailed(true);
    } finally {
      if (bgGenRef.current === myGen) setBgProcessing(false);
    }
  }, []);

  // ── Save whichever version the user chose ─────────────────────────────────
  const handleSave = useCallback(async () => {
    const blob = selected === "cleaned" && cleanedBlob ? cleanedBlob : originalBlob;
    if (!blob) return;
    setPhase("uploading");
    try {
      const path     = await blobToDataUrl(blob);
      const label    = CATEGORY_LABELS[category];
      const n        = existingCount + 1;
      const autoName = n === 1 ? label : `${label} ${n}`;
      await new Promise<void>((resolve, reject) => {
        createItem.mutate(
          { data: { name: autoName, category, imageObjectPath: path } },
          {
            onSuccess: (createdItem) => {
              queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
              queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
              if (onCreated) onCreated(createdItem);
              resolve();
            },
            onError: reject,
          },
        );
      });

      // If there are more queued files, process the next one without closing
      const remaining = fileQueueRef.current;
      if (remaining.length > 0) {
        const next = remaining[0];
        fileQueueRef.current = remaining.slice(1);
        setQueuePos((p) => p + 1);
        // Reset preview state then start next file
        setErrorMsg(null);
        setOriginalBlob(null);
        setOriginalUrl(null);
        setCleanedBlob(null);
        setCleanedUrl(null);
        setBgFailed(false);
        setBgProcessing(false);
        setSelected("original");
        handleFile(next);
      } else {
        handleClose();
      }
    } catch (err) {
      setErrorMsg(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
      setPhase("preview");
    }
  }, [selected, cleanedBlob, originalBlob, handleClose, handleFile, category, existingCount, createItem, queryClient, onCreated]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    // Queue remaining files; start first immediately
    fileQueueRef.current = files.slice(1);
    setQueuePos(1);
    setQueueTotal(files.length);
    handleFile(files[0]);
  };

  if (!open) return null;

  const label = CATEGORY_LABELS[category];

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 md:left-[220px] z-[70] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 bg-[#f9f4ee] border-b border-[#C8B870]/30 flex-shrink-0"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
      >
        <h2 className="font-display font-bold text-xl uppercase tracking-tight flex items-center gap-2 text-[#5C4A1E]">
          Add {label}
          {queueTotal > 1 && (
            <span className="text-sm font-normal opacity-40 normal-case tracking-normal">
              ({queuePos}/{queueTotal})
            </span>
          )}
        </h2>
        {phase === "pick" && (
          <button
            onClick={handleClose}
            className="w-9 h-9 border border-[#C8B870]/50 rounded-full flex items-center justify-center
                       bg-[#faf8f2] text-[#8B6914] hover:bg-[#f0e8d0] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Body — plain conditional divs; NO AnimatePresence.
          Any AnimatePresence wrapper creates exit-animation windows where no
          child is mounted → blank screen between every phase change. */}
      <div className="flex-1 flex flex-col overflow-y-auto">

        {/* ── PICK ── */}
        {phase === "pick" && (
          <div className="flex flex-col p-5 gap-5">
            {errorMsg && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
                {errorMsg}
              </p>
            )}

            <div className="flex gap-3">
              {/* Take Photo */}
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex-1 flex flex-col items-center justify-center gap-3 py-8
                           border border-[#C8B870]/45 rounded-2xl bg-[#faf8f2]
                           shadow-sm hover:bg-[#f4eedf] active:scale-[0.98]
                           transition-all"
              >
                <span className="text-4xl leading-none">📷</span>
                <span className="font-display font-bold text-base uppercase tracking-tight text-center leading-tight text-[#5C4A1E]">
                  Take<br />Photo
                </span>
              </button>

              {/* Upload Photo */}
              <button
                onClick={() => galleryInputRef.current?.click()}
                className="flex-1 flex flex-col items-center justify-center gap-3 py-8
                           border border-[#C8B870]/45 rounded-2xl bg-[#faf8f2]
                           shadow-sm hover:bg-[#f4eedf] active:scale-[0.98]
                           transition-all"
              >
                <span className="text-4xl leading-none">🖼️</span>
                <span className="font-display font-bold text-base uppercase tracking-tight text-center leading-tight text-[#5C4A1E]">
                  Upload<br />Photo
                </span>
              </button>
            </div>

            {CATEGORY_EXAMPLES[category] && (
              <div className="border border-[#C8B870]/45 rounded-2xl bg-[#faf8f2] p-4">
                <p className="font-display font-bold text-sm uppercase tracking-tight mb-2 flex items-center gap-2 text-[#5C4A1E]">
                  <span>{CATEGORY_EXAMPLES[category].emoji}</span> WHAT TO ADD
                </p>
                <p className="text-sm text-[#7A6235]/80 leading-snug">
                  {CATEGORY_EXAMPLES[category].items.join(", ")}
                </p>
              </div>
            )}

            <div className="border border-[#C8B870]/45 rounded-2xl bg-[#faf8f2] p-4">
              <p className="font-display font-bold text-sm uppercase tracking-tight mb-3 flex items-center gap-2 text-[#5C4A1E]">
                <span>📸</span> PHOTO TIPS
              </p>
              <ul className="flex flex-col gap-2">
                {PHOTO_TIPS.map((tip) => (
                  <li key={tip} className="flex items-start gap-2 text-sm text-[#7A6235]/80 leading-snug">
                    <span className="mt-0.5 w-4 h-4 border border-[#C8B870]/60 rounded-sm bg-[#E8D4B0]
                                     flex items-center justify-center flex-shrink-0">
                      <Check className="w-2.5 h-2.5 text-[#8B6914]" strokeWidth={3} />
                    </span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ── ENCODING — full-screen spinner shown immediately after photo is picked ── */}
        {phase === "encoding" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
            <div className="w-28 h-28 border border-[#C8B870]/45 rounded-3xl bg-[#faf8f2]
                            flex items-center justify-center shadow-sm">
              <Loader2 className="w-12 h-12 animate-spin text-[#B8894E]" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="font-display font-bold text-2xl uppercase tracking-tight text-[#5C4A1E]">Processing…</p>
              <p className="text-sm text-[#7A6235]/70 mt-1">Getting your photo ready.</p>
            </div>
          </div>
        )}

        {/* ── PREVIEW — side-by-side Original | Cleaned ✨ comparison ── */}
        {phase === "preview" && (
          <div className="flex flex-col gap-4 p-5">
            {errorMsg && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
                {errorMsg}
              </p>
            )}

            <p className="text-center font-display font-bold text-xs uppercase tracking-widest opacity-40">
              {bgProcessing ? "This will take a moment…" : bgFailed ? "Original" : "Tap to choose"}
            </p>

            {/* Cards */}
            <div className="flex gap-3">
              {/* Original card */}
              <button
                onClick={() => setSelected("original")}
                className="flex-1 flex flex-col overflow-hidden rounded-2xl transition-all"
                style={{
                  border: selected === "original"
                    ? "2px solid #B8894E"
                    : "2px solid rgba(200,184,112,0.3)",
                  background: "none",
                  padding: 0,
                }}
              >
                <div className="relative bg-black" style={{ minHeight: 176 }}>
                  {originalUrl && (
                    <img
                      src={originalUrl}
                      alt="Original"
                      className="w-full object-contain block"
                      style={{ maxHeight: 176 }}
                    />
                  )}
                  {selected === "original" && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#B8894E]
                                    flex items-center justify-center">
                      <Check size={12} color="white" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <p className="text-center font-display font-bold text-xs uppercase tracking-widest py-1.5">
                  Original
                </p>
              </button>

              {/* Cleaned card */}
              <button
                onClick={() => cleanedUrl && setSelected("cleaned")}
                disabled={!cleanedUrl}
                className="flex-1 flex flex-col overflow-hidden rounded-2xl transition-all"
                style={{
                  border: selected === "cleaned" && cleanedUrl
                    ? "2px solid #B8894E"
                    : "2px solid rgba(200,184,112,0.3)",
                  background: "none",
                  padding: 0,
                }}
              >
                {/* Checkerboard reveals transparency */}
                <div
                  className="relative flex items-center justify-center"
                  style={{
                    background: "repeating-conic-gradient(#d1d5db 0% 25%, white 0% 50%) 0 0 / 12px 12px",
                    minHeight: 176,
                  }}
                >
                  {cleanedUrl ? (
                    <>
                      <img
                        src={cleanedUrl}
                        alt="Cleaned"
                        className="w-full object-contain block"
                        style={{ maxHeight: 176 }}
                      />
                      {selected === "cleaned" && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#B8894E]
                                        flex items-center justify-center">
                          <Check size={12} color="white" strokeWidth={3} />
                        </div>
                      )}
                    </>
                  ) : bgFailed ? (
                    <p className="text-xs font-bold uppercase opacity-40 text-center px-3">
                      Could not remove background
                    </p>
                  ) : (
                    /* Spinner while ONNX model downloads (~15 MB, first use only) and runs */
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 size={32} className="animate-spin opacity-50" />
                      <p className="text-xs font-bold uppercase opacity-50">Processing</p>
                    </div>
                  )}
                </div>
                <p className="text-center font-display font-bold text-xs uppercase tracking-widest py-1.5">
                  Cleaned ✨
                </p>
              </button>
            </div>

            {/* Action row */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setPhase("pick")}
                className="flex items-center justify-center gap-2 px-4 py-3
                           border border-[#C8B870]/45 rounded-xl bg-[#faf8f2] font-display font-bold text-sm uppercase
                           text-[#5C4A1E] hover:bg-[#f0e8d0] active:scale-[0.98] transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                Retake
              </button>
              <button
                onClick={handleSave}
                disabled={selected === "cleaned" && !cleanedUrl}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3
                           rounded-xl font-display font-bold text-sm uppercase text-[#3D2800]
                           active:scale-[0.98] transition-all
                           disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg, #E8D4B0, #B8894E)",
                }}
              >
                <Check className="w-4 h-4" />
                {selected === "cleaned" && !cleanedUrl ? "Processing…" : "Save to Garden"}
              </button>
            </div>
          </div>
        )}

        {/* ── UPLOADING ── */}
        {phase === "uploading" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
            <div className="w-28 h-28 border border-[#C8B870]/45 rounded-3xl bg-[#faf8f2]
                            flex items-center justify-center shadow-sm">
              <Loader2 className="w-12 h-12 animate-spin text-[#B8894E]" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="font-display font-bold text-2xl uppercase tracking-tight text-[#5C4A1E]">Saving…</p>
              <p className="text-sm text-[#7A6235]/70 mt-1">Adding to your garden.</p>
            </div>
          </div>
        )}

      </div>

      {/* Hidden file inputs */}
      {/* Camera — opens native camera on mobile */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />
      {/* Gallery — opens photo library / file picker (multiple selection allowed) */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleInputChange}
      />
    </motion.div>
  );
}
