/**
 * seedRevenueCat — one-time setup script.
 *
 * Creates the RevenueCat project, iOS App Store app, products, entitlements,
 * offerings, and packages for My Digital Suitcase.
 *
 * Run with:
 *   pnpm --filter scripts seed:revenuecat
 *
 * After running, copy the printed API keys into these Replit secrets:
 *   VITE_REVENUECAT_TEST_KEY
 *   VITE_REVENUECAT_IOS_KEY
 */
import { getUncachableRevenueCatClient } from "./revenueCatClient";

import {
  listProjects,
  createProject,
  listApps,
  createApp,
  listAppPublicApiKeys,
  listProducts,
  createProduct,
  listEntitlements,
  createEntitlement,
  attachProductsToEntitlement,
  listOfferings,
  createOffering,
  updateOffering,
  listPackages,
  createPackages,
  attachProductsToPackage,
  type App,
  type Product,
  type Project,
  type Entitlement,
  type Offering,
  type Package,
  type CreateProductData,
} from "@replit/revenuecat-sdk";

// ── App configuration ─────────────────────────────────────────────────────────

const PROJECT_NAME              = "My Digital Suitcase";
const APP_STORE_APP_NAME        = "My Digital Suitcase";
const APP_STORE_BUNDLE_ID       = "com.mydigitalsuitcase.app";

// Product — monthly subscription ($9.99/month)
const PRODUCT_IDENTIFIER        = "premium_monthly";
const PRODUCT_DISPLAY_NAME      = "Pro Stylist Monthly";
const PRODUCT_USER_FACING_TITLE = "Pro Stylist";
const PRODUCT_DURATION          = "P1M";

// Entitlement
const ENTITLEMENT_IDENTIFIER    = "premium";
const ENTITLEMENT_DISPLAY_NAME  = "Premium Access";

// Offering
const OFFERING_IDENTIFIER       = "default";
const OFFERING_DISPLAY_NAME     = "Default Offering";

// Package
const PACKAGE_IDENTIFIER        = "$rc_monthly";
const PACKAGE_DISPLAY_NAME      = "Monthly";

// Prices (in micros = value × 1,000,000)
const PRODUCT_PRICES = [
  { amount_micros: 9990000, currency: "USD" }, // $9.99
];

type TestStorePricesResponse = {
  object: string;
  prices: { amount_micros: number; currency: string }[];
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
  const client = await getUncachableRevenueCatClient();

  // ── Project ──────────────────────────────────────────────────────────────────
  let project: Project;
  const { data: existingProjects, error: listProjectsError } = await listProjects({
    client,
    query: { limit: 20 },
  });
  if (listProjectsError) throw new Error(`Failed to list projects: ${JSON.stringify(listProjectsError)}`);

  const existingProject = existingProjects.items?.find((p) => p.name === PROJECT_NAME);
  if (existingProject) {
    console.log("Project already exists:", existingProject.id);
    project = existingProject;
  } else {
    const { data: newProject, error } = await createProject({ client, body: { name: PROJECT_NAME } });
    if (error) throw new Error("Failed to create project");
    console.log("Created project:", newProject.id);
    project = newProject;
  }

  // ── Apps ──────────────────────────────────────────────────────────────────────
  const { data: apps, error: listAppsError } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listAppsError || !apps) throw new Error("Failed to list apps");

  let testApp: App | undefined = apps.items.find((a) => a.type === "test_store");
  let appStoreApp: App | undefined = apps.items.find((a) => a.type === "app_store");

  if (!testApp) throw new Error("No test store app found — check RevenueCat project");
  console.log("Test store app:", testApp.id);

  if (!appStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: {
        name:      APP_STORE_APP_NAME,
        type:      "app_store",
        app_store: { bundle_id: APP_STORE_BUNDLE_ID },
      },
    });
    if (error) throw new Error("Failed to create App Store app");
    appStoreApp = newApp;
    console.log("Created App Store app:", appStoreApp.id);
  } else {
    console.log("App Store app already exists:", appStoreApp.id);
  }

  // ── Products ──────────────────────────────────────────────────────────────────
  const { data: existingProducts, error: listProductsError } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });
  if (listProductsError) throw new Error("Failed to list products");

  const ensureProduct = async (targetApp: App, label: string, isTest: boolean): Promise<Product> => {
    const existing = existingProducts.items?.find(
      (p) => p.store_identifier === PRODUCT_IDENTIFIER && p.app_id === targetApp.id
    );
    if (existing) { console.log(`${label} product exists:`, existing.id); return existing; }

    const body: CreateProductData["body"] = {
      store_identifier: PRODUCT_IDENTIFIER,
      app_id:           targetApp.id,
      type:             "subscription",
      display_name:     PRODUCT_DISPLAY_NAME,
    };
    if (isTest) {
      body.subscription = { duration: PRODUCT_DURATION };
      body.title = PRODUCT_USER_FACING_TITLE;
    }
    const { data, error } = await createProduct({ client, path: { project_id: project.id }, body });
    if (error) throw new Error(`Failed to create ${label} product`);
    console.log(`Created ${label} product:`, data.id);
    return data;
  };

  const testProduct     = await ensureProduct(testApp,     "Test Store", true);
  const appStoreProduct = await ensureProduct(appStoreApp, "App Store",  false);

  // Set test store prices
  const { error: priceError } = await client.post<TestStorePricesResponse>({
    url:  "/projects/{project_id}/products/{product_id}/test_store_prices",
    path: { project_id: project.id, product_id: testProduct.id },
    body: { prices: PRODUCT_PRICES },
  });
  if (priceError) {
    if (
      priceError &&
      typeof priceError === "object" &&
      "type" in priceError &&
      priceError["type"] === "resource_already_exists"
    ) {
      console.log("Test store prices already set");
    } else {
      console.warn("Non-fatal: could not set test store prices:", priceError);
    }
  } else {
    console.log("Set test store prices");
  }

  // ── Entitlement ───────────────────────────────────────────────────────────────
  let entitlement: Entitlement;
  const { data: existingEntitlements, error: listEntitlementsError } = await listEntitlements({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listEntitlementsError) throw new Error("Failed to list entitlements");

  const existingEnt = existingEntitlements.items?.find((e) => e.lookup_key === ENTITLEMENT_IDENTIFIER);
  if (existingEnt) {
    console.log("Entitlement exists:", existingEnt.id);
    entitlement = existingEnt;
  } else {
    const { data, error } = await createEntitlement({
      client,
      path: { project_id: project.id },
      body: { lookup_key: ENTITLEMENT_IDENTIFIER, display_name: ENTITLEMENT_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create entitlement");
    console.log("Created entitlement:", data.id);
    entitlement = data;
  }

  const { error: attachEntError } = await attachProductsToEntitlement({
    client,
    path: { project_id: project.id, entitlement_id: entitlement.id },
    body: { product_ids: [testProduct.id, appStoreProduct.id] },
  });
  if (attachEntError) {
    if (attachEntError.type === "unprocessable_entity_error") {
      console.log("Products already attached to entitlement");
    } else {
      throw new Error("Failed to attach products to entitlement");
    }
  } else {
    console.log("Attached products to entitlement");
  }

  // ── Offering ──────────────────────────────────────────────────────────────────
  let offering: Offering;
  const { data: existingOfferings, error: listOfferingsError } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listOfferingsError) throw new Error("Failed to list offerings");

  const existingOff = existingOfferings.items?.find((o) => o.lookup_key === OFFERING_IDENTIFIER);
  if (existingOff) {
    console.log("Offering exists:", existingOff.id);
    offering = existingOff;
  } else {
    const { data, error } = await createOffering({
      client,
      path: { project_id: project.id },
      body: { lookup_key: OFFERING_IDENTIFIER, display_name: OFFERING_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create offering");
    console.log("Created offering:", data.id);
    offering = data;
  }

  if (!offering.is_current) {
    const { error } = await updateOffering({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { is_current: true },
    });
    if (error) throw new Error("Failed to set offering as current");
    console.log("Set as current offering");
  }

  // ── Package ───────────────────────────────────────────────────────────────────
  let pkg: Package;
  const { data: existingPackages, error: listPackagesError } = await listPackages({
    client,
    path: { project_id: project.id, offering_id: offering.id },
    query: { limit: 20 },
  });
  if (listPackagesError) throw new Error("Failed to list packages");

  const existingPkg = existingPackages.items?.find((p) => p.lookup_key === PACKAGE_IDENTIFIER);
  if (existingPkg) {
    console.log("Package exists:", existingPkg.id);
    pkg = existingPkg;
  } else {
    const { data, error } = await createPackages({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { lookup_key: PACKAGE_IDENTIFIER, display_name: PACKAGE_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create package");
    console.log("Created package:", data.id);
    pkg = data;
  }

  const { error: attachPkgError } = await attachProductsToPackage({
    client,
    path: { project_id: project.id, package_id: pkg.id },
    body: {
      products: [
        { product_id: testProduct.id,     eligibility_criteria: "all" },
        { product_id: appStoreProduct.id, eligibility_criteria: "all" },
      ],
    },
  });
  if (attachPkgError) {
    if (
      attachPkgError.type === "unprocessable_entity_error" &&
      attachPkgError.message?.includes("Cannot attach product")
    ) {
      console.log("Package already has products");
    } else {
      throw new Error("Failed to attach products to package");
    }
  } else {
    console.log("Attached products to package");
  }

  // ── Print keys ────────────────────────────────────────────────────────────────
  const { data: testKeys,  error: e1 } = await listAppPublicApiKeys({ client, path: { project_id: project.id, app_id: testApp.id } });
  const { data: iosKeys,   error: e2 } = await listAppPublicApiKeys({ client, path: { project_id: project.id, app_id: appStoreApp.id } });
  if (e1 || e2) throw new Error("Failed to fetch public API keys");

  console.log("\n==================== DONE ====================");
  console.log("REVENUECAT_PROJECT_ID:                ", project.id);
  console.log("REVENUECAT_TEST_STORE_APP_ID:         ", testApp.id);
  console.log("REVENUECAT_APPLE_APP_STORE_APP_ID:    ", appStoreApp.id);
  console.log("VITE_REVENUECAT_TEST_KEY:             ", testKeys?.items?.[0]?.key ?? "N/A");
  console.log("VITE_REVENUECAT_IOS_KEY:              ", iosKeys?.items?.[0]?.key ?? "N/A");
  console.log("==============================================\n");
  console.log("👆 Copy these values into your Replit secrets / Codemagic environment group.");
}

seed().catch((err) => { console.error(err); process.exit(1); });
