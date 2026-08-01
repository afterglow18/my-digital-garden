/**
 * Entitlement tier definitions — single source of truth for limits and capabilities.
 *
 * Tiers:
 *   "free"   — default; up to FREE_ITEM_LIMIT items, FREE_OUTFIT_LIMIT saved outfits.
 *   "unlock" — My Digital Garden Pro (RC entitlement); unlimited items + outfits.
 */

export type Tier = "free" | "unlock";

/** Adjust these constants to run promotions or A/B tests without touching logic. */
export const FREE_ITEM_LIMIT   = 20;
export const FREE_OUTFIT_LIMIT = 5;

export interface TierCapabilities {
  /** Maximum clothing items, or null for unlimited. */
  maxItems:   number | null;
  /** Maximum saved outfits, or null for unlimited. */
  maxOutfits: number | null;
  /** Access to the interactive 3D mannequin view. */
  mannequin:  boolean;
}

export const TIER_CAPS: Record<Tier, TierCapabilities> = {
  free:   { maxItems: FREE_ITEM_LIMIT, maxOutfits: FREE_OUTFIT_LIMIT, mannequin: false },
  unlock: { maxItems: null,            maxOutfits: null,              mannequin: true  },
};

/** Products available for purchase (all map to the "My Digital Garden Pro" RC entitlement). */
export type PurchaseProduct = "unlock";

export const PRODUCT_PRICES: Record<PurchaseProduct, string> = {
  unlock: "$9.99",
};
