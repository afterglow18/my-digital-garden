/**
 * RevenueCat API client factory for the @workspace/scripts seed scripts.
 *
 * Uses the Replit Connectors proxy so OAuth tokens are handled automatically
 * and never need to be stored in env vars or secrets.
 *
 * Usage:
 *   const client = await getUncachableRevenueCatClient();
 *   const { data } = await listProjects({ client });
 */

import { createClient, createConfig } from "@replit/revenuecat-sdk/client";
import { ReplitConnectors } from "@replit/connectors-sdk";

// The @replit/revenuecat-sdk appends paths like /projects, /apps, etc.
// The connector proxy prepends https://api.revenuecat.com, so we pass /v2/…
const RC_V2_BASE = "https://api.revenuecat.com/v2";

/**
 * Creates a fresh RevenueCat management API client on every call.
 * All requests are proxied through the Replit RevenueCat connector, which
 * injects and refreshes OAuth tokens automatically.
 */
export async function getUncachableRevenueCatClient() {
  const connectors = new ReplitConnectors();

  /**
   * Custom fetch implementation that routes every request through the
   * Replit connector proxy instead of going directly to api.revenuecat.com.
   *
   * The SDK builds URLs like https://api.revenuecat.com/v2/projects.
   * We extract the full path (/v2/projects) and pass it to proxy().
   */
  const proxyFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);

    // Derive the path+query from the full URL the SDK built
    const apiPath = url.pathname + url.search;

    // Read the body once (may be a ReadableStream)
    const bodyText =
      request.method !== "GET" && request.method !== "HEAD"
        ? await request.text()
        : undefined;

    // Build headers to forward (exclude Host; the proxy sets it)
    const forwardedHeaders: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "host") forwardedHeaders[key] = value;
    });

    // Route through the Replit connector
    const proxiedResponse = await connectors.proxy("revenuecat", apiPath, {
      method:  request.method as "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
      body:    bodyText,
      headers: forwardedHeaders,
    });

    return proxiedResponse as unknown as Response;
  };

  return createClient(
    createConfig({
      baseUrl: RC_V2_BASE,
      fetch:   proxyFetch,
    }),
  );
}
