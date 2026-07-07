/**
 * Seed script — creates both purchasable products in Stripe.
 *
 *   • Unlock Forever  — $4.99 one-time  (product_key: 'unlock')
 *   • Pro Stylist     — $9.99 one-time  (product_key: 'premium')
 *
 * Idempotent: checks for existing products before creating.
 *
 * Run with:
 *   pnpm --filter @workspace/scripts run seed-products
 */
import { getUncachableStripeClient } from './stripeClient';

interface ProductSpec {
  key:         string;
  name:        string;
  description: string;
  amount:      number;   // cents
}

const PRODUCTS: ProductSpec[] = [
  {
    key:         'unlock',
    name:        'Unlock Forever',
    description: 'Unlimited wardrobe items and saved outfits. One-time purchase, no subscription.',
    amount:      499,
  },
  {
    key:         'premium',
    name:        'Pro Stylist',
    description:
      'Everything in Unlock Forever plus the 360° mannequin outfit view. ' +
      'Dress a realistic mannequin, rotate it 360°, and see outfits from every angle. ' +
      'One-time purchase, includes future Pro features.',
    amount:      999,
  },
];

async function seedProduct(stripe: Awaited<ReturnType<typeof getUncachableStripeClient>>, spec: ProductSpec) {
  console.log(`\nChecking for existing '${spec.key}' product...`);

  const existing = await stripe.products.search({
    query: `metadata['product_key']:'${spec.key}' AND active:'true'`,
    limit: 1,
  });

  if (existing.data.length > 0) {
    const product = existing.data[0];
    const prices  = await stripe.prices.list({ product: product.id, active: true, limit: 1 });
    const price   = prices.data[0];
    console.log(`  ✓ Already exists: ${product.name} (${product.id})`);
    if (price) {
      console.log(`  ✓ Active price:   $${(price.unit_amount! / 100).toFixed(2)} (${price.id})`);
    }
    return;
  }

  console.log(`  Creating '${spec.name}'...`);
  const product = await stripe.products.create({
    name:        spec.name,
    description: spec.description,
    metadata:    { product_key: spec.key },
  });
  console.log(`  ✓ Created product: ${product.name} (${product.id})`);

  const price = await stripe.prices.create({
    product:     product.id,
    unit_amount: spec.amount,
    currency:    'usd',
    metadata:    { product_key: spec.key },
  });
  console.log(`  ✓ Created price:   $${(spec.amount / 100).toFixed(2)} one-time (${price.id})`);
}

async function seed() {
  const stripe = await getUncachableStripeClient();

  for (const spec of PRODUCTS) {
    await seedProduct(stripe, spec);
  }

  console.log('\n✅ Done! Stripe will sync products to your database automatically via webhook.');
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
