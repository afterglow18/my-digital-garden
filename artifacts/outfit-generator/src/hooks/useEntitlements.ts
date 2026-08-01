/**
 * useEntitlements — maps RevenueCat subscription state to the app's tier/caps model.
 *
 * Tier mapping:
 *   no active "My Digital Garden Pro" entitlement → "free"  (up to 20 items, 5 outfits)
 *   active "My Digital Garden Pro" entitlement    → "unlock" (unlimited everything)
 *
 * PurchaseResult:
 *   "success"     — subscription activated
 *   "cancelled"   — user dismissed the native purchase sheet
 *   "unavailable" — not running on a native device, or no products loaded yet
 */
import { useCallback } from "react";
import { Tier, TIER_CAPS, TierCapabilities } from "@/lib/entitlements";
import { useSubscription } from "@/lib/revenuecat";

export type PurchaseResult = "success" | "cancelled" | "unavailable";
export type PurchaseProduct = "unlock";

export function setGlobalTier(_t: Tier): void { /* no-op — RC manages state */ }

export function useEntitlements() {
  const { isSubscribed, offerings, purchase: rcPurchase, isPurchasing } =
    useSubscription();

  const tier: Tier = isSubscribed ? "unlock" : "free";
  const caps: TierCapabilities = TIER_CAPS[tier];

  const canAddItem = useCallback(
    (count: number) => caps.maxItems === null || count < caps.maxItems,
    [caps.maxItems],
  );

  const canSaveOutfit = useCallback(
    (count: number) => caps.maxOutfits === null || count < caps.maxOutfits,
    [caps.maxOutfits],
  );

  const purchase = useCallback(
    async (_product: PurchaseProduct): Promise<PurchaseResult> => {
      const pkg = offerings?.current?.availablePackages?.[0];
      if (!pkg) return "unavailable";

      try {
        await rcPurchase(pkg);
        return "success";
      } catch (err: unknown) {
        // RevenueCat throws with userCancelled flag on user dismiss
        if (err && typeof err === "object" && "userCancelled" in err) {
          return "cancelled";
        }
        const msg = err instanceof Error ? err.message.toLowerCase() : "";
        if (msg.includes("cancel") || msg.includes("dismiss")) return "cancelled";
        return "unavailable";
      }
    },
    [offerings, rcPurchase],
  );

  return { tier, caps, canAddItem, canSaveOutfit, purchase, isPurchasing };
}
