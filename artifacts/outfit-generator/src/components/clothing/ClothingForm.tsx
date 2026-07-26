import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ClothingItemInputCategory } from "@/hooks/useLocalDB";
import { useCallback, useRef, useState } from "react";
import { ImagePlus, Loader2, Check, RotateCcw } from "lucide-react";
import { getImageUrl } from "@/lib/utils";
import {
  removeBackground,
  blobToDataUrl,
  dataUrlToBlob,
} from "@/lib/backgroundRemoval";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.nativeEnum(ClothingItemInputCategory),
  color: z.string().optional(),
  brand: z.string().optional(),
  notes: z.string().optional(),
  isFavorite: z.boolean().default(false),
  imageObjectPath: z.string().optional().nullable(),
});

export type ClothingFormData = z.infer<typeof formSchema>;

interface ClothingFormProps {
  initialData?: Partial<ClothingFormData>;
  onSubmit: (data: ClothingFormData) => void;
  isSubmitting: boolean;
  submitLabel: string;
}

/**
 * Resize and JPEG-encode a File/Blob to ≤2048px on the longest edge.
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

export function ClothingForm({ initialData, onSubmit, isSubmitting, submitLabel }: ClothingFormProps) {
  const form = useForm<ClothingFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name || "",
      category: initialData?.category || "tools",
      color: initialData?.color || "",
      brand: initialData?.brand || "",
      notes: initialData?.notes || "",
      isFavorite: initialData?.isFavorite || false,
      imageObjectPath: initialData?.imageObjectPath || null,
    },
  });

  // Background removal state
  const [isEncoding,   setIsEncoding]   = useState(false);
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [originalUrl,  setOriginalUrl]  = useState<string | null>(null);
  const [cleanedBlob,  setCleanedBlob]  = useState<Blob | null>(null);
  const [cleanedUrl,   setCleanedUrl]   = useState<string | null>(null);
  const [bgProcessing, setBgProcessing] = useState(false);
  const [bgFailed,     setBgFailed]     = useState(false);
  const [selected,     setSelected]     = useState<"original" | "cleaned">("original");
  const [showPreview,  setShowPreview]  = useState(false);

  // Generation guard — prevents stale async results from clobbering newer picks
  const bgGenRef = useRef(0);

  const handleFile = useCallback(async (file: File) => {
    const myGen = ++bgGenRef.current;
    setIsEncoding(true);
    setOriginalBlob(null);
    setOriginalUrl(null);
    setCleanedBlob(null);
    setCleanedUrl(null);
    setBgFailed(false);
    setBgProcessing(false);
    setSelected("original");
    setShowPreview(false);

    let jpeg: Blob;
    try {
      jpeg = await encodeForUpload(file);
    } catch (err) {
      if (bgGenRef.current !== myGen) return;
      console.error("Encode error:", err);
      setIsEncoding(false);
      return;
    }
    if (bgGenRef.current !== myGen) return;

    const objUrl = URL.createObjectURL(jpeg);
    setOriginalBlob(jpeg);
    setOriginalUrl(objUrl);
    setIsEncoding(false);
    setShowPreview(true);

    // Kick off background removal
    setBgProcessing(true);
    try {
      const dataUrl    = await blobToDataUrl(jpeg);
      if (bgGenRef.current !== myGen) return;
      const resultUrl  = await removeBackground(dataUrl);
      if (bgGenRef.current !== myGen) return;
      const resultBlob    = await dataUrlToBlob(resultUrl);
      const resultObjUrl  = URL.createObjectURL(resultBlob);
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

  // When the user confirms their selection, convert the blob to a data URL and
  // store it in the form field. Then hide the comparison UI.
  const handleConfirm = useCallback(async () => {
    const blob = selected === "cleaned" && cleanedBlob ? cleanedBlob : originalBlob;
    if (!blob) return;
    const dataUrl = await blobToDataUrl(blob);
    form.setValue("imageObjectPath", dataUrl);
    setShowPreview(false);
  }, [selected, cleanedBlob, originalBlob, form]);

  // Reset photo
  const handleRetake = useCallback(() => {
    bgGenRef.current += 1;
    setOriginalBlob(null);
    setOriginalUrl(null);
    setCleanedBlob(null);
    setCleanedUrl(null);
    setBgFailed(false);
    setBgProcessing(false);
    setSelected("original");
    setShowPreview(false);
    form.setValue("imageObjectPath", null);
  }, [form]);

  const imagePath = form.watch("imageObjectPath");
  const categories = Object.values(ClothingItemInputCategory);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
      
      {/* Image Upload / Preview Area */}
      <div className="relative">
        {/* Comparison preview — shown after a file is picked */}
        {showPreview ? (
          <div className="flex flex-col gap-3">
            <p className="text-center font-bold text-xs uppercase tracking-widest opacity-40">
              {bgProcessing ? "Removing background…" : bgFailed ? "Original only" : "Tap to choose"}
            </p>

            {/* Side-by-side cards */}
            <div className="flex gap-3">
              {/* Original */}
              <button
                type="button"
                onClick={() => setSelected("original")}
                className="flex-1 flex flex-col overflow-hidden rounded-2xl transition-all"
                style={{
                  border: selected === "original" ? "4px solid black" : "4px solid rgba(0,0,0,0.2)",
                  background: "none",
                  padding: 0,
                }}
              >
                <div className="relative bg-black" style={{ minHeight: 140 }}>
                  {originalUrl && (
                    <img
                      src={originalUrl}
                      alt="Original"
                      className="w-full object-contain block"
                      style={{ maxHeight: 140 }}
                    />
                  )}
                  {selected === "original" && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black flex items-center justify-center">
                      <Check size={12} color="white" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <p className="text-center font-bold text-xs uppercase tracking-widest py-1.5">
                  Original
                </p>
              </button>

              {/* Cleaned */}
              <button
                type="button"
                onClick={() => cleanedUrl && setSelected("cleaned")}
                disabled={!cleanedUrl}
                className="flex-1 flex flex-col overflow-hidden rounded-2xl transition-all"
                style={{
                  border: selected === "cleaned" && cleanedUrl ? "4px solid black" : "4px solid rgba(0,0,0,0.2)",
                  background: "none",
                  padding: 0,
                }}
              >
                <div
                  className="relative flex items-center justify-center"
                  style={{
                    background: "repeating-conic-gradient(#d1d5db 0% 25%, white 0% 50%) 0 0 / 12px 12px",
                    minHeight: 140,
                  }}
                >
                  {cleanedUrl ? (
                    <>
                      <img
                        src={cleanedUrl}
                        alt="Cleaned"
                        className="w-full object-contain block"
                        style={{ maxHeight: 140 }}
                      />
                      {selected === "cleaned" && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black flex items-center justify-center">
                          <Check size={12} color="white" strokeWidth={3} />
                        </div>
                      )}
                    </>
                  ) : bgFailed ? (
                    <p className="text-xs font-bold uppercase opacity-40 text-center px-3">
                      Could not remove background
                    </p>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 size={28} className="animate-spin opacity-50" />
                      <p className="text-xs font-bold uppercase opacity-50">Processing</p>
                    </div>
                  )}
                </div>
                <p className="text-center font-bold text-xs uppercase tracking-widest py-1.5">
                  Cleaned ✨
                </p>
              </button>
            </div>

            {/* Action row */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleRetake}
                className="flex items-center justify-center gap-2 px-4 py-3
                           border-2 border-black rounded-xl bg-white font-bold text-sm uppercase
                           shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                           active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                Retake
              </button>
              <button
                type="button"
                onClick={handleConfirm}
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
        ) : (
          /* Standard upload area — shown when no preview is active */
          <div
            className="aspect-[4/3] w-full border-4 border-dashed border-black bg-muted flex items-center justify-center relative overflow-hidden group"
          >
            {imagePath ? (
              <img src={getImageUrl(imagePath)!} alt="Upload preview" className="w-full h-full object-cover" />
            ) : (
              <div className="text-center flex flex-col items-center p-4">
                <div className="w-16 h-16 bg-white border-2 border-black rounded-full shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center mb-4">
                  <ImagePlus className="w-8 h-8" />
                </div>
                <span className="font-bold uppercase text-muted-foreground">Upload Photo</span>
              </div>
            )}

            {isEncoding && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-white animate-spin" />
              </div>
            )}

            <input
              type="file"
              accept="image/*"
              disabled={isEncoding}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </div>
        )}

        {/* If a confirmed photo is stored, show a small retake link */}
        {imagePath && !showPreview && (
          <button
            type="button"
            onClick={handleRetake}
            className="mt-2 flex items-center gap-1 text-xs font-bold uppercase opacity-60 hover:opacity-100 transition-opacity"
          >
            <RotateCcw className="w-3 h-3" />
            Change photo
          </button>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label className="block font-bold uppercase text-sm mb-1">Item Name *</label>
          <input 
            {...form.register("name")}
            placeholder="e.g. Vintage Plaid Skirt"
            className="w-full px-4 py-3 bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:translate-y-0.5 focus:translate-x-0.5 outline-none transition-all font-medium"
          />
          {form.formState.errors.name && (
            <span className="text-destructive text-sm font-bold mt-1 block">{form.formState.errors.name.message}</span>
          )}
        </div>

        <div>
          <label className="block font-bold uppercase text-sm mb-2">Category *</label>
          <div className="grid grid-cols-3 gap-2">
            {categories.map(cat => (
              <label key={cat} className="cursor-pointer">
                <input 
                  type="radio" 
                  value={cat} 
                  {...form.register("category")} 
                  className="sr-only peer"
                />
                <div className="px-2 py-3 text-center border-2 border-black bg-white peer-checked:bg-secondary font-bold text-xs uppercase tracking-tight transition-colors">
                  {cat}
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block font-bold uppercase text-sm mb-1">Color</label>
            <input 
              {...form.register("color")}
              placeholder="Yellow"
              className="w-full px-3 py-2 bg-white border-2 border-black focus:bg-accent outline-none font-medium"
            />
          </div>
          <div>
            <label className="block font-bold uppercase text-sm mb-1">Brand</label>
            <input 
              {...form.register("brand")}
              placeholder="e.g. Thrifted"
              className="w-full px-3 py-2 bg-white border-2 border-black focus:bg-accent outline-none font-medium"
            />
          </div>
        </div>

        <div>
          <label className="block font-bold uppercase text-sm mb-1">Notes</label>
          <textarea 
            {...form.register("notes")}
            placeholder="Totally matches with..."
            rows={3}
            className="w-full px-3 py-2 bg-white border-2 border-black focus:bg-accent outline-none font-medium resize-none"
          />
        </div>

        <label className="flex items-center gap-3 p-4 border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] cursor-pointer">
          <input 
            type="checkbox" 
            {...form.register("isFavorite")}
            className="w-6 h-6 border-2 border-black appearance-none checked:bg-primary checked:after:content-['★'] checked:after:text-black checked:after:flex checked:after:items-center checked:after:justify-center checked:after:h-full checked:after:text-sm transition-colors"
          />
          <span className="font-bold uppercase tracking-wider">Mark as Favorite</span>
        </label>
      </div>

      <button 
        type="submit"
        disabled={isSubmitting || isEncoding || showPreview}
        className="btn-brutalist py-4 rounded-xl w-full text-lg mt-4 disabled:opacity-50"
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> saving...
          </span>
        ) : submitLabel}
      </button>
    </form>
  );
}
