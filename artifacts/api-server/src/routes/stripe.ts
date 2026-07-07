/**
 * Stripe payment routes.
 *
 * POST /api/stripe/checkout  — create a one-time Checkout Session
 * GET  /api/stripe/verify    — verify a completed Checkout Session
 *
 * Security design:
 *   - success_url / cancel_url are constructed server-side from trusted sources
 *     (Origin header + REPLIT_DOMAINS allowlist). Clients supply only a relative
 *     returnPath so an attacker cannot redirect victims to an arbitrary domain.
 *   - session_id is validated by format before being sent to Stripe; the verify
 *     endpoint always queries Stripe directly (never trusting client state).
 */
import { Router, type IRouter } from "express";
import { getUncachableStripeClient } from "../stripeClient";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Stripe checkout session IDs begin with cs_ */
const SESSION_ID_RE = /^cs_[a-zA-Z0-9_]{10,300}$/;

/**
 * Resolve the origin to use for Stripe return URLs.
 * Trusted priority order:
 *   1. Request Origin header (same-origin fetch from browser)
 *   2. First domain in REPLIT_DOMAINS env var
 *   3. Host header (dev fallback)
 */
function resolveOrigin(req: any): string {
  const origin = req.headers.origin as string | undefined;
  if (origin) return origin.replace(/\/+$/, "");

  const replitDomains = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (replitDomains) return `https://${replitDomains}`;

  return `${req.protocol}://${req.get("host")}`;
}

/**
 * Returns true when returnPath is a safe relative path (starts with /, no //,
 * no protocol markers).  Rejects anything that could become an open redirect.
 */
function isSafePath(p: unknown): p is string {
  return (
    typeof p === "string" &&
    p.startsWith("/") &&
    !p.startsWith("//") &&
    !p.includes("://") &&
    p.length <= 200
  );
}

// ── POST /api/stripe/checkout ─────────────────────────────────────────────────
// Creates a Stripe Checkout session for a one-time purchase.
//
// Body: { product: "unlock", returnPath?: string }
//   returnPath — relative path to return to (e.g. "/outfit-generator/").
//               The server constructs the full URL so the client cannot
//               supply an arbitrary domain (open-redirect prevention).
//
// Returns: { url: string }
router.post("/stripe/checkout", async (req, res): Promise<void> => {
  try {
    const { product, returnPath } = req.body as {
      product?: unknown;
      returnPath?: unknown;
    };

    if (product !== "unlock" && product !== "premium") {
      res.status(400).json({ error: "Unknown product. Valid products: 'unlock', 'premium'." });
      return;
    }

    // Validate returnPath — only allow safe relative paths.
    const path = isSafePath(returnPath) ? returnPath : "/";

    // Derive origin server-side — never trust a full URL from the client.
    const origin = resolveOrigin(req);
    const successUrl = `${origin}${path}?unlock=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${origin}${path}?unlock=cancelled`;

    const stripe = await getUncachableStripeClient();

    // Look up the product by metadata tag — no env var for price_id needed.
    const products = await stripe.products.search({
      query: `metadata['product_key']:'${product}' AND active:'true'`,
      limit: 1,
    });

    if (!products.data.length) {
      res.status(503).json({
        error:
          `Product '${product}' not configured in Stripe. ` +
          "Run: pnpm --filter @workspace/scripts run seed-products",
      });
      return;
    }

    const prices = await stripe.prices.list({
      product: products.data[0].id,
      active: true,
      limit: 1,
    });

    if (!prices.data.length) {
      res.status(503).json({ error: "No active price found for the unlock product." });
      return;
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{ price: prices.data[0].id, quantity: 1 }],
      mode: "payment",
      success_url: successUrl,
      cancel_url:  cancelUrl,
      metadata: { product_key: product },
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error("[stripe/checkout] error:", err.message);
    res.status(500).json({ error: "Failed to create checkout session." });
  }
});

// ── GET /api/stripe/verify ────────────────────────────────────────────────────
// Verifies a Stripe Checkout Session completed successfully.
//
// Query: ?session_id=cs_test_...
// Returns: { verified: boolean, product: string | null }
//
// Error semantics:
//   400  — missing or malformed session_id
//   404  — session not found in Stripe (bad ID after format check passes)
//   502  — Stripe API unreachable / upstream error
//   500  — unexpected internal error
router.get("/stripe/verify", async (req, res): Promise<void> => {
  const { session_id } = req.query as { session_id?: string };

  // Validate format before hitting the Stripe API.
  if (!session_id || typeof session_id !== "string") {
    res.status(400).json({ error: "session_id query param is required." });
    return;
  }
  if (!SESSION_ID_RE.test(session_id)) {
    res.status(400).json({ error: "Invalid session_id format." });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(session_id);

    const verified = session.payment_status === "paid";
    const product  = session.metadata?.product_key ?? null;

    res.json({ verified, product });
  } catch (err: any) {
    // Stripe returns a StripeInvalidRequestError (status 404) for unknown IDs.
    if (err?.statusCode === 404 || err?.code === "resource_missing") {
      res.status(404).json({ verified: false, error: "Session not found." });
      return;
    }
    // Network / timeout / connectivity issues.
    if (err?.type === "StripeConnectionError" || err?.code === "ECONNREFUSED") {
      console.error("[stripe/verify] upstream error:", err.message);
      res.status(502).json({ error: "Stripe API unreachable. Try again shortly." });
      return;
    }
    console.error("[stripe/verify] unexpected error:", err.message);
    res.status(500).json({ error: "Failed to verify session." });
  }
});

export default router;
