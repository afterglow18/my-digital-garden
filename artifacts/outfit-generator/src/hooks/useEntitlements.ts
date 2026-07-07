/**
 * useEntitlements
 *
 * Reads the user's current tier from localStorage and exposes capability
 * helpers.  Uses useSyncExternalStore so every mounted instance of this hook
 * shares the same tier and updates atomically when a purchase completes —
 * even across components that each call the hook independently.
 *
 * Tier is persisted locally so it survives page refreshes without a network
 * round-trip.  Payment is verified server-side via the Stripe verify endpoint
 * before the tier is upgraded — localStorage alone is not trusted for access.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STRIPE CHECKOUT FLOW
 *
 * 1. purchase("unlock") is called from a paywall component.
 * 2. runCheckout posts to POST /api/stripe/checkout and receives a session URL.
 * 3. The page navigates to Stripe-hosted checkout.
 * 4. On success Stripe redirects back to /?unlock=success&session_id=<id>.
 * 5. App.tsx detects those params, calls GET /api/stripe/verify?session_id=<id>,
 *    and if verified calls setGlobalTier("unlock").
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useCallback, useSyncExternalStore } from "react";
import {
  Tier,
  TIER_CAPS,
  TierCapabilities,
  PurchaseProduct,
} from "@/lib/entitlements";

// ── Shared external store ─────────────────────────────────────────────────────
// All hook instances share a single in-memory value so a purchase in any
// component (e.g. UpgradeSheet) immediately updates all others.

const STORAGE_KEY = "mdc_tier";

function readStoredTier(): Tier {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "unlock" || v === "premium") return v;
  } catch {
    // localStorage unavailable (private browsing with strict settings, etc.)
  }
  return "free";
}

let _currentTier: Tier = readStoredTier();
const _subscribers = new Set<() => void>();

function subscribeTier(notify: () => void) {
  _subscribers.add(notify);
  return () => { _subscribers.delete(notify); };
}

function getTierSnapshot(): Tier {
  return _currentTier;
}

/** Update the shared tier store and persist to localStorage. */
export function setGlobalTier(t: Tier): void {
  try { localStorage.setItem(STORAGE_KEY, t); } catch {}
  _currentTier = t;
  _subscribers.forEach((fn) => fn());
}

// ── Purchase result ───────────────────────────────────────────────────────────

export type PurchaseResult = "success" | "cancelled" | "unavailable";

/**
 * Initiates a Stripe Checkout session for the given product.
 *
 * Redirects the page to Stripe's hosted checkout.  The function technically
 * returns "cancelled" but the browser will navigate away before that value
 * is used — App.tsx handles the return trip via the success_url params.
 */
async function runCheckout(product: PurchaseProduct): Promise<PurchaseResult> {

  try {
    // BASE_URL includes trailing slash, e.g. "/outfit-generator/".
    // We send only the relative path — the server constructs the full URL
    // from a trusted origin to prevent open-redirect abuse.
    const returnPath = (import.meta.env.BASE_URL as string) ?? "/";

    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product, returnPath }),
    });

    if (!res.ok) return "unavailable";

    const data = await res.json() as { url?: string };
    if (!data.url) return "unavailable";

    // Navigate to Stripe-hosted checkout.
    window.location.href = data.url;
    // Page navigates; this return is never reached during a normal flow.
    return "cancelled";
  } catch {
    return "unavailable";
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useEntitlements() {
  // useSyncExternalStore keeps all hook instances in sync across components.
  const tier = useSyncExternalStore(subscribeTier, getTierSnapshot);

  const caps: TierCapabilities = TIER_CAPS[tier];

  /** True if the user can add another item given the current wardrobe size. */
  const canAddItem = useCallback(
    (currentCount: number) =>
      caps.maxItems === null || currentCount < caps.maxItems,
    [caps.maxItems],
  );

  /** True if the user can save another outfit given the current saved count. */
  const canSaveOutfit = useCallback(
    (currentCount: number) =>
      caps.maxOutfits === null || currentCount < caps.maxOutfits,
    [caps.maxOutfits],
  );

  /**
   * Trigger the purchase flow for a product.
   * Returns "success", "cancelled", or "unavailable" (provider not configured).
   * On "success", the shared tier store is updated automatically.
   */
  const purchase = useCallback(
    async (product: PurchaseProduct): Promise<PurchaseResult> => {
      const result = await runCheckout(product);
      if (result === "success") {
        setGlobalTier(product === "unlock" ? "unlock" : "premium");
      }
      return result;
    },
    [],
  );

  return { tier, caps, canAddItem, canSaveOutfit, purchase };
}
