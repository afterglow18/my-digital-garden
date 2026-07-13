import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ClothingItemInputCategory } from "@workspace/api-client-react";
import { useCallback, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { getImageUrl } from "@/lib/utils";

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

export function ClothingForm({ initialData, onSubmit, isSubmitting, submitLabel }: ClothingFormProps) {
  const form = useForm<ClothingFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name || "",
      category: initialData?.category || "outfits",
      color: initialData?.color || "",
      brand: initialData?.brand || "",
      notes: initialData?.notes || "",
      isFavorite: initialData?.isFavorite || false,
      imageObjectPath: initialData?.imageObjectPath || null,
    },
  });

  const [isUploading, setIsUploading] = useState(false);
  const uploadFile = useCallback(async (file: File) => {
    setIsUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, 800 / img.naturalWidth);
          canvas.width  = Math.round(img.naturalWidth  * scale);
          canvas.height = Math.round(img.naturalHeight * scale);
          canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.onerror = reject;
        img.src = url;
      });
      form.setValue("imageObjectPath", dataUrl);
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setIsUploading(false);
    }
  }, [form]);

  const imagePath = form.watch("imageObjectPath");
  const categories = Object.values(ClothingItemInputCategory);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
      
      {/* Image Upload Area */}
      <div className="relative">
        <div className="aspect-[4/3] w-full border-4 border-dashed border-black bg-muted flex items-center justify-center relative overflow-hidden group">
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
          
          {isUploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className="w-12 h-12 text-white animate-spin" />
            </div>
          )}

          <input 
            type="file" 
            accept="image/*"
            disabled={isUploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadFile(file);
            }}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </div>
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
        disabled={isSubmitting || isUploading}
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
