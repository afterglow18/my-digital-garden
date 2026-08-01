/**
 * RevenueCat integration — using @revenuecat/purchases-capacitor.
 *
 * • On iOS (Capacitor native): full purchase flow via StoreKit.
 * • In browser (Replit preview / web): purchases show "unavailable" gracefully.
 *
 * Static import is intentional — Vite's dynamic import() creates a lazy chunk
 * that hangs silently in Capacitor's WKWebView; the static import ensures the
 * plugin is bundled in the main chunk and ready synchronously.
 *
 * Premium access is ALWAYS derived from a live RC CustomerInfo fetch.
 * It is never stored in or read from localStorage.
 *
 * CustomerInfo is refreshed:
 *   1. On app launch (initial query mount)
 *   2. On app foreground (appStateChange listener)
 *   3. Immediately after a successful purchase (cache seeded + invalidated)
 *   4. Immediately after Restore Purchases (cache seeded + invalidated)
 *   5. Whenever RC pushes a server-side update (addCustomerInfoUpdateListener)
 *      — this catches refunds, expirations, and subscription lapses in real-time.
 */

import React, { createContext, useContext, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// Static import — must stay at top level so Vite bundles it in the main chunk.
import { Purchases, LOG_LEVEL } from "@revenuecat/purchases-capacitor";

// ── Constants ─────────────────────────────────────────────────────────────────

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "My Digital Garden Pro";

const RC_TEST_KEY = import.meta.env.VITE_REVENUECAT_TEST_KEY as string | undefined;
const RC_IOS_KEY  = import.meta.env.VITE_REVENUECAT_IOS_KEY  as string | undefined;

function getApiKey(): string {
  const isNative = Capacitor.isNativePlatform();
  if (isNative && RC_IOS_KEY) return RC_IOS_KEY;
  if (RC_TEST_KEY) return RC_TEST_KEY;
  throw new Error("RevenueCat API key not configured");
}

// ── Native guard ──────────────────────────────────────────────────────────────
// Returns the static Purchases object when running natively, null in browser.
// Callers must guard with this — never call Purchases methods in the browser.

function getNativePurchases() {
  return Capacitor.isNativePlatform() ? Purchases : null;
}

// ── Initialization ────────────────────────────────────────────────────────────

export async function initializeRevenueCat(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const apiKey = getApiKey();

  // Fire-and-forget — do NOT await either call.
  // The Swift→JS bridge response may never arrive on Capacitor 8 + SPM;
  // the native SDK initialises synchronously on message receipt.
  void Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG })
    .then(() => console.log("[RC] setLogLevel ✓"))
    .catch((e) => console.warn("[RC] setLogLevel failed:", e));

  void Purchases.configure({ apiKey })
    .then(() => console.log("[RC] configure() response ✓"))
    .catch((e) => console.error("[RC] configure() error:", e));

  // One microtask to let the bridge message dispatch before marking ready.
  await Promise.resolve();
  console.log("[RevenueCat] configure() fired — SDK initialising");
}

// ── Query key ─────────────────────────────────────────────────────────────────

const CUSTOMER_INFO_KEY = ["revenuecat", "customer-info"] as const;

// ── Subscription context ──────────────────────────────────────────────────────

function useSubscriptionContext() {
  const qc = useQueryClient();

  // staleTime: 0 — always considered stale so every mount/focus triggers a
  // fresh fetch. The foreground listener below handles mid-session refreshes.
  const customerInfoQuery = useQuery({
    queryKey: CUSTOMER_INFO_KEY,
    queryFn: async () => {
      const P = getNativePurchases();
      if (!P) return null;
      const { customerInfo } = await P.getCustomerInfo();
      return customerInfo;
    },
    staleTime: 0,
    retry: false,
  });

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: async () => {
      const P = getNativePurchases();
      if (!P) return null;
      const result = await P.getOfferings();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (result as any).offerings ?? result ?? null;
    },
    staleTime: 300 * 1000,
    retry: false,
  });

  // ── Foreground + server-push listeners ─────────────────────────────────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let appListenerHandle: Awaited<ReturnType<typeof import("@capacitor/app").App.addListener>> | null = null;
    let rcCallbackId: string | null = null;

    (async () => {
      // 1. Recheck CustomerInfo every time the app comes back to the foreground.
      try {
        const { App } = await import("@capacitor/app");
        appListenerHandle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            console.log("[RevenueCat] App foregrounded — rechecking CustomerInfo");
            qc.invalidateQueries({ queryKey: CUSTOMER_INFO_KEY });
          }
        });
      } catch (err) {
        console.warn("[RevenueCat] Could not add appStateChange listener:", err);
      }

      // 2. RC server-push: fires when RC detects a refund, expiry, or any
      //    server-side entitlement change — revokes access in real-time.
      try {
        const P = getNativePurchases();
        if (P) {
          rcCallbackId = await P.addCustomerInfoUpdateListener(
            (customerInfo) => {
              console.log("[RevenueCat] CustomerInfo pushed from server — updating cache");
              qc.setQueryData(CUSTOMER_INFO_KEY, customerInfo);
            }
          );
        }
      } catch (err) {
        console.warn("[RevenueCat] Could not add CustomerInfo listener:", err);
      }
    })();

    return () => {
      appListenerHandle?.remove();
      if (rcCallbackId !== null) {
        const P = getNativePurchases();
        P?.removeCustomerInfoUpdateListener({ listenerToRemove: rcCallbackId })
          .catch(() => {/* non-fatal */});
      }
    };
  }, [qc]);

  // ── Purchase ───────────────────────────────────────────────────────────────
  const purchaseMutation = useMutation({
    mutationFn: async (pkg: unknown) => {
      const P = getNativePurchases();
      if (!P) throw new Error("Purchases not available in browser");
      const { customerInfo } = await P.purchasePackage({ aPackage: pkg as never });
      return customerInfo;
    },
    onSuccess: (customerInfo) => {
      // Seed the cache immediately with the fresh CustomerInfo RC just returned,
      // then invalidate to schedule a background re-fetch for confirmation.
      qc.setQueryData(CUSTOMER_INFO_KEY, customerInfo);
      qc.invalidateQueries({ queryKey: ["revenuecat"] });
    },
  });

  // ── Restore ────────────────────────────────────────────────────────────────
  const restoreMutation = useMutation({
    mutationFn: async () => {
      const P = getNativePurchases();
      if (!P) throw new Error("Purchases not available in browser");
      const { customerInfo } = await P.restorePurchases();
      return customerInfo;
    },
    onSuccess: (customerInfo) => {
      // Same pattern: seed immediately, then confirm in background.
      qc.setQueryData(CUSTOMER_INFO_KEY, customerInfo);
      qc.invalidateQueries({ queryKey: ["revenuecat"] });
    },
  });

  // ── Entitlement check — derived purely from live RC data ───────────────────
  // Never reads localStorage. If customerInfo is null (not yet loaded or
  // browser), isSubscribed is false — safe default to free tier.
  const isSubscribed =
    customerInfoQuery.data?.entitlements?.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;

  return {
    customerInfo:  customerInfoQuery.data ?? null,
    offerings:     offeringsQuery.data ?? null,
    isSubscribed,
    isLoading:     customerInfoQuery.isLoading || offeringsQuery.isLoading,
    purchase:      purchaseMutation.mutateAsync,
    restore:       restoreMutation.mutateAsync,
    isPurchasing:  purchaseMutation.isPending,
    isRestoring:   restoreMutation.isPending,
    purchaseError: purchaseMutation.error as Error | null,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useSubscription must be inside <SubscriptionProvider>");
  return ctx;
}
