import React from "react";
import { Sheet } from "@/components/ui/sheet";
import { ClothingForm, ClothingFormData } from "./ClothingForm";
import { useCreateClothingItem, getListClothingQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface AddClothingSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCategory?: string;
}

export function AddClothingSheet({ open, onOpenChange, defaultCategory }: AddClothingSheetProps) {
  const createItem = useCreateClothingItem();
  const queryClient = useQueryClient();

  const handleSubmit = (data: ClothingFormData) => {
    createItem.mutate(
      { data: { ...data, imageObjectPath: data.imageObjectPath || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          onOpenChange(false);
        }
      }
    );
  };

  const title = defaultCategory
    ? `Add ${defaultCategory.charAt(0).toUpperCase() + defaultCategory.slice(1, -1)}`
    : "New Item";

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      <ClothingForm
        key={defaultCategory ?? "any"}
        onSubmit={handleSubmit}
        isSubmitting={createItem.isPending}
        submitLabel="Add to Vanity"
        initialData={defaultCategory ? { category: defaultCategory as ClothingFormData["category"] } : undefined}
      />
    </Sheet>
  );
}
