# My Digital Garden — Outfit Generator

A mobile-first digital wardrobe app where you upload clothing photos, categorize them, and generate random outfits — inspired by the iconic Clueless closet scene.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/outfit-generator run dev` — run the web frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS` — Object storage (auto-configured)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite + Wouter (routing) + Framer Motion + Tailwind CSS v4
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- File uploads: Replit Object Storage (GCS presigned URLs)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for the API contract
- `lib/db/src/schema/clothing.ts` — clothing items table + types
- `lib/db/src/schema/outfits.ts` — saved outfits + outfit_items join table
- `artifacts/api-server/src/routes/clothing.ts` — clothing CRUD + outfit generation + stats
- `artifacts/api-server/src/routes/outfits.ts` — saved outfits CRUD
- `artifacts/api-server/src/routes/storage.ts` — presigned upload URL + object serving
- `artifacts/outfit-generator/src/` — React frontend

## Architecture decisions

- Outfit generator picks one item per category (tops → bottoms → shoes → outerwear → dresses → accessories). If a dress is picked, tops/bottoms are skipped.
- Image uploads use a two-step presigned URL flow: client requests URL from `/api/storage/uploads/request-url`, then PUTs file directly to GCS. Object path stored in DB. Served via `/api/storage/objects/<path>`.
- Upload auth check removed for first build (no auth middleware); uploads are open. Add Replit Auth + re-enable the `isAuthenticated` guard in `storage.ts` if access control is needed.
- Sidebar.tsx ships as a shadcn component but is unused in this mobile-bottom-nav app; stub Sheet sub-components keep it type-checking.

## Product

- **Wardrobe** (`/`) — grid of clothing with category filter tabs, polaroid-style cards, floating add button
- **Generate** (`/generate`) — hero experience with staggered outfit reveal animation, re-spin, and save
- **Saved** (`/saved`) — lookbook of saved outfits with mini collage previews

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After any `lib/api-spec/openapi.yaml` change, run `pnpm --filter @workspace/api-spec run codegen` before writing routes or hooks.
- Object storage serving: store `objectPath` from upload response, serve via `/api/storage` + objectPath (do NOT double-prefix with `/objects/`).
- pnpm overrides in root `package.json` pin react/react-dom to `19.1.0` for Uppy v5 peer dep compatibility.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `object-storage` skill for upload flow details
