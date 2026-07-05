/**
 * ItemDetailsSheet — full-screen overlay showing a clothing item's details.
 * Every field is optional and editable. A "Save" button appears only when
 * the form is dirty. Delete is always available.
 */
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Heart, Trash2, Save, ChevronDown,
} from "lucide-react";
import {
  ClothingItem,
  useUpdateClothingItem,
  useDeleteClothingItem,
  getListClothingQueryKey,
  getListOutfitsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getImageUrl } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEASON_OPTIONS   = ["", "Spring", "Summer", "Fall", "Winter", "All Season"];
const OCCASION_OPTIONS = ["", "Casual", "Work", "Formal", "Sport", "Special Event"];

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
  };
}

function isDirty(form: FormState, item: ClothingItem): boolean {
  return (
    form.name          !== (item.name          ?? "") ||
    form.brand         !== (item.brand         ?? "") ||
    form.color         !== (item.color         ?? "") ||
    form.size          !== (item.size          ?? "") ||
    form.season        !== (item.season        ?? "") ||
    form.occasion      !== (item.occasion      ?? "") ||
    form.purchasePrice !== (item.purchasePrice ?? "") ||
    form.purchaseDate  !== (item.purchaseDate  ?? "") ||
    form.notes         !== (item.notes         ?? "") ||
    form.isFavorite    !== (item.isFavorite    ?? false)
  );
}

export function ItemDetailsSheet({ item, onClose, onDeleted }: ItemDetailsSheetProps) {
  const [form, setForm]           = useState<FormState | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const updateItem  = useUpdateClothingItem();
  const deleteItem  = useDeleteClothingItem();
  const queryClient = useQueryClient();

  // Reset form whenever item changes
  useEffect(() => {
    if (item) setForm(toForm(item));
    setShowDeleteConfirm(false);
  }, [item?.id]);

  if (!item || !form) return null;

  const dirty = isDirty(form, item);

  const patch = (key: keyof FormState) => (value: string | boolean) =>
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);

  const handleSave = () => {
    updateItem.mutate(
      {
        id: item.id,
        data: {
          // Always send every editable field so the backend can clear it when empty.
          // Backend converts "" → null in DB.
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
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
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
      className="fixed inset-0 z-[65] flex flex-col max-w-md mx-auto bg-[#f9f4ee] overflow-y-auto"
    >
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3
                      bg-white border-b-2 border-black flex-shrink-0">
        <h2 className="font-display font-bold text-xl uppercase tracking-tight">
          Item Details
        </h2>
        <div className="flex items-center gap-2">
          {/* Favourite toggle */}
          <button
            onClick={() => patch("isFavorite")(!form.isFavorite)}
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

      {/* ── Photo ── */}
      {item.imageObjectPath && (
        <div
          className="w-full h-52 flex-shrink-0 border-b-2 border-black"
          style={{
            backgroundImage: "repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)",
            backgroundSize: "16px 16px",
          }}
        >
          <img
            src={getImageUrl(item.imageObjectPath)!}
            alt={item.name}
            className="w-full h-full object-contain"
          />
        </div>
      )}

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
        <Field label="Size" value={form.size} onChange={patch("size") as (v: string) => void} placeholder="S, M, L, 32, 8…" />

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

        {/* Category + Times Worn — read-only */}
        <div className="grid grid-cols-2 gap-3 opacity-50 pointer-events-none">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">Category</span>
            <div className="border-2 border-black/20 rounded-lg px-3 py-2 text-sm font-medium bg-white/50 capitalize">
              {item.category}
            </div>
          </div>
          <div className="flex flex-col gap-1">
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
            Remove from Closet
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
              {deleteItem.isPending ? "Deleting…" : "Yes, Delete"}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
