# cc0-lib Refactor — Project Summary

## Overview

The abandoned **cc0-lib** project (a Nouns DAO CC0 asset library) was refactored from a brittle server-dependent architecture into a **fully static, zero-OpEx, Git-driven public asset registry**. The original site broke due to dead external dependencies (Notion API, Bundlr SDK, Vercel KV, custom proxy servers, etc.). The refactored app drives recurring operational costs to **$0.00/month** by reading from a local compiled JSON index while delivering assets from permanently-paid Arweave storage.

## Current Status

- **Code:** First rebuild complete, cleaned, and verified (`next build` green).
- **Repo:** Pushed to **https://github.com/BeanInTheMachine/cc0-lib** (public, `main`). The original `cc0-lib/cc0-lib` is kept as the `upstream` remote.
- **Hosting:** Targeting Vercel (Free Tier). Site runs on the auto-assigned `*.vercel.app` URL until a custom domain is attached.
- **Custom domain:** `cc0-lib.wtf` is the intended domain but is **not yet acquired** — it is still ACTIVE under the previous owner. The codebase resolves its base URL dynamically (see below), so attaching the domain later requires no code change.
- **Version:** `2.0.0`.

## Architectural Decisions

| Decision | Reasoning |
|----------|-----------|
| **Static `metadata.json` index** | Replaces live Notion DB and Bundlr GraphQL queries. Single source of truth for the gallery. |
| **Arweave for file storage only** | All assets permanently stored on Arweave. Multi-gateway fallback (`arweave.net`, `ar-io.net`, `permaweb.io`) for delivery resilience. |
| **Bare Arweave tx URLs** | Assets are single data transactions served at `https://arweave.net/{txId}` — **not** path manifests. Appending the filename (`/{txId}/{filename}`) returns 404, so all `ThumbnailURL`/`File` values are the bare tx URL. |
| **`<img>` + gateway rotation** | Arweave assets render via `GatewayImage` (plain `<img>` with `onError` gateway rotation), bypassing the Next.js image optimizer (which broke on Arweave). `next/image` is still used only for the cloudnouns cursor PFP and the video-player overlay logo. |
| **Configurable site URL** | `getSiteUrl()` resolves the base URL in order: `NEXT_PUBLIC_SITE_URL` → Vercel's `VERCEL_PROJECT_PRODUCTION_URL` → fallback `https://cc0-lib.wtf`. Drives every canonical/OG/Twitter/sitemap/robots/share URL — correct on `vercel.app` automatically, auto-switches to `cc0-lib.wtf` once it becomes the production domain. |
| **Vercel Free Tier hosting** | Hybrid static + single serverless function for submissions. Not a pure static export. Auto-deploys on every push to `main`. |
| **GitHub API submit endpoint** | Serverless `POST /api/submit` uses `GITHUB_TOKEN` to fetch → append → commit `metadata.json`, triggering a Vercel redeploy. |
| **No auth for browsing** | Public read-only gallery. Submit endpoint protected by `SUBMIT_SECRET` Bearer token. |
| **Real brand logos** | Original `cc0lib.svg` / `cc0lib-h.svg` were recovered from git history (`/public/`); the live `cc0-lib.wtf` asset host is unreachable. |
| **Notion data lost** | The `notion-api.splitbee.io` proxy returns HTTP 500. Rich metadata (titles, descriptions, tags) is unrecoverable. Current catalog built from Arweave transaction tags only. |

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      DATA LAYER (Storage)                        │
│  Arweave — permanently paid transactions, multi-gateway delivery │
│  Bare tx URLs: arweave.net/{txId} → ar-io.net → permaweb.io      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                   DATABASE LAYER (Index)                         │
│  src/data/metadata.json  —  single compiled static file         │
│  Built by scripts/import-legacy.ts  (run once, commit to git)   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                   COMPUTE LAYER (Hosting)                        │
│  Vercel Free Tier — Next.js hybrid static + serverless           │
│  Base URL resolved via getSiteUrl() (env-driven)                 │
│  POST /api/submit → GitHub API → commit metadata.json → redeploy │
└─────────────────────────────────────────────────────────────────┘
```

## How to Run

```bash
# Development
npm run dev          # Starts on http://localhost:3000

# Production build
npm run build        # TypeScript + Next.js build
npm start            # Serve production build

# Lint / Typecheck
npx eslint "src/**/*.{ts,tsx}"
npx tsc --noEmit

# Import legacy data (one-time)
npm run import-legacy     # Runs scripts/import-legacy.ts
```

## Environment Variables (`.env`)

```env
# Optional — public base URL for canonical/OG/sitemap/share links.
# On Vercel this auto-resolves from VERCEL_PROJECT_PRODUCTION_URL,
# falling back to https://cc0-lib.wtf. Set to override (e.g. custom domain).
NEXT_PUBLIC_SITE_URL=

# Required for POST /api/submit
SUBMIT_SECRET=             # Shared secret Bearer token
GITHUB_TOKEN=              # GitHub PAT with repo contents read/write
GITHUB_OWNER=              # GitHub username or org (e.g. BeanInTheMachine)
GITHUB_REPO=               # Repository name (e.g. cc0-lib)
```

The app works without any env vars for read-only browsing.

## File Inventory

### New / Key Files

| File | Purpose |
|------|---------|
| `scripts/import-legacy.ts` | One-time script: queries Arweave GraphQL for `App: "cc0-lib uploader"` transactions, builds `metadata.json` (bare tx URLs) |
| `src/data/metadata.json` | Static catalog — array of `Item` objects (2,797 entries after dedup) |
| `src/lib/metadata.ts` | Central data access: `readMetadata()`, `getItemBySlug()`, `getLeaderboard()`, `slugify()`, `shuffle()`, `shortDomainName()` |
| `src/lib/gateway-url.ts` | `ARWEAVE_GATEWAYS` list + `extractArweaveId()` |
| `src/lib/site-url.ts` | `getSiteUrl()` — env-driven base URL resolver |
| `src/lib/constants.ts` | Static page list, `DEV_MODE` |
| `src/app/api/submit/route.ts` | Serverless submit endpoint — GitHub API commit flow |
| `src/app/robots.ts` | Dynamic robots (sitemap URL follows `getSiteUrl()`) |
| `src/app/sitemap.tsx` | Dynamic XML sitemap (URLs from `getSiteUrl()`) |
| `src/components/ui/gateway-image.tsx` | Client component: `<img>` with `onError` fallback rotation through Arweave gateways |
| `public/cc0lib.svg` / `cc0lib-h.svg` | Real brand logos (restored from git history) |
| `.env.example` | Documented env vars |

### Key Modified Files

| File | Changes |
|------|---------|
| `src/app/page.tsx` | `readMetadata()`; metadata URLs via `getSiteUrl()` |
| `src/app/[slug]/page.tsx` | `getItemBySlug()`; Next 16 `params` Promise; `next/image` → `GatewayImage`; metadata + `SocialShare baseUrl` via `getSiteUrl()` |
| `src/app/front-page.tsx` | `<GatewayImage>`; removed Web3/analytics; real horizontal logo |
| `src/app/fav/*` | `readMetadata()`; `<GatewayImage>`; localStorage-only likes |
| `src/app/leaderboard/page.tsx` | `readMetadata()` + `getLeaderboard()` |
| `src/app/random/page.tsx` | `readMetadata()`; `next/image` → `GatewayImage`; site URL |
| `src/app/sitemap.tsx` / `sitemap/page.tsx` | `readMetadata()`; URLs via `getSiteUrl()` |
| `src/app/info/page.tsx` | Removed dead-route cards (`/log`, `/api`, `/companion`); site URL |
| `src/app/contribute/page.tsx` | Removed dead dashboard section + `/dashboard`, `/submit`, `/dashboard/uploader` links; site URL |
| `src/app/privacy/page.tsx`, `disclaimer/page.tsx` | Metadata URLs via `getSiteUrl()` |
| `src/app/layout.tsx` | Removed Web3Provider/analytics; added `metadataBase` from `getSiteUrl()` |
| `src/components/ui/video-player.tsx` | Logo `cc0-lib.wtf` → local `/cc0lib.svg` |
| `src/components/ui/social-share.tsx` | Share/embed URLs via injected `baseUrl` prop |
| `src/lib/utils.ts` | Stripped dead Notion/FC/KV helpers and `bytesToString`/`copyToClipboard`; kept `cn`, `getLikedItems`, `blobSize` |
| `next.config.js` | Removed cloudflare loader, CORS, polyfills; `remotePatterns` reduced to `api.cloudnouns.com`; `dangerouslyAllowSVG` kept |
| `package.json` | Removed ~14 dead deps + unused UI/tooling deps; standardized on npm; v2.0.0 |
| `src/typing.d.ts` | Removed dead types; kept `Item`, `ItemThumbnail` |

### Deleted Files/Directories

**Original refactor (~20):** `src/app/dashboard/`, `draft/`, `companion/`, `submit/`, `log/`, `loading-test/`, `rive-test/`; dead API routes (`api/data`, `notion`, `random`, `embedding`, `fc`, `bundlr`); `src/pages/api/auth/siwe/`; `src/lib/notion/`, `siwe/`, `redis.ts`, `constant.ts`, `types/`; `src/middleware.ts`; `src/components/dashboard/`, `fc/`, `web3/`; `data/comments.tsx`, `page-views.tsx`; `src/hooks/`.

**Cleanup pass:** `src/app/api/page.tsx` + `api/endpoint.ts` (stale `/api` docs), `src/lib/image-loader.ts`, `src/data/unmapped-assets.json`, `src/components/data/copy.tsx`, `data/image-dl.tsx`, `data/sentiment.tsx`, `ui/loading-text.tsx`, `ui/badge.tsx`, `ui/tooltip.tsx`, `ui/accordion.tsx`, `public/vercel.svg`, `public/next.svg`, `public/loading.riv`, `src/app/robots.txt` (→ `robots.ts`), `bun.lockb`.

## Type System

**Core type — `Item`** (global, declared in `src/typing.d.ts`):
```typescript
type Item = {
  id: string;           // Arweave transaction ID
  Source: string;
  Type: string;         // "Image" | "Video" | "Audio" | "3D" | "Working Files" | "GIF"
  "Social Link"?: string;
  Filetype: string;     // "PNG" | "MP4" | "GLB" | etc.
  ENS?: string;
  Description: string;
  Thumbnails: ItemThumbnail[];
  Tags: string[];
  ID: number;           // Sequential numeric ID
  Title: string;
  File?: string;        // Bare Arweave URL: https://arweave.net/{txId}
  Status?: "published" | "draft";
  SubmissionStatus?: "draft" | "submitted" | "under-review" | "approved" | "rejected";
  ParentDB?: string;
  ThumbnailURL?: string; // Bare Arweave URL: https://arweave.net/{txId}
};
```

**Arweave items** built by the import script populate: `id`, `Title` (from filename), `Description` (auto-generated `"Uploaded by {ENS}"`), `Type`/`Filetype` (derived from Content-Type), `File`/`ThumbnailURL` (bare Arweave URLs), `ENS` (Uploader tag), `Tags` (`["cc0-lib-upload"]`).

## Key Components

| Component | File | Purpose |
|-----------|------|---------|
| `FrontPage` | `src/app/front-page.tsx` | Masonry gallery grid, search, filter by type/tag/format, infinite scroll |
| `DetailsPage` | `src/app/[slug]/page.tsx` | Item detail view — renders video, audio, 3D, Figma, PDF, images |
| `GatewayImage` | `src/components/ui/gateway-image.tsx` | Arweave-aware `<img>` with multi-gateway `onError` fallback (used by gallery, detail, random, fav) |
| `LeaderboardPage` | `src/app/leaderboard/page.tsx` | Top contributors by ENS |
| `RandomPage` | `src/app/random/page.tsx` | Random item viewer |
| `FavPage` | `src/app/fav/fav-page.tsx` | localStorage-based favorites grid |
| `SocialShare` | `src/components/ui/social-share.tsx` | Twitter/Warpcast/email share, URLs from `baseUrl` prop |

## API Routes

Only one active route:

**`POST /api/submit`**
- Auth: `Authorization: Bearer {SUBMIT_SECRET}`
- Body: `{ arweaveId, title, description, type, filetype, tags, ens, source?, socialLink?, filename? }`
- Flow: Validate → construct Item (bare Arweave URL) → fetch metadata.json from GitHub API → append → commit to `main` → Vercel redeploys

## Known Limitations

1. **Notion metadata lost.** The `notion-api.splitbee.io` proxy is dead (HTTP 500). Rich titles, descriptions, source links, and custom tags from the original catalog are unrecoverable unless a backup exists.
2. **Arweave-only catalog.** Items derive titles from filenames and types from Content-Type tags. Descriptions are auto-generated.
3. **No user authentication.** SIWE/wagmi removed. Favorites are localStorage-only (per-device, not synced).
4. **No comments/views.** KV-backed comments and page views removed.
5. **No Farcaster integration / no file upload.** Removed. Users upload to Arweave independently and submit the TX ID via the API.
6. **Catalog size.** 2,816 Arweave transactions found; 19 duplicates removed → 2,797 unique items.
7. **Custom domain pending.** `cc0-lib.wtf` is still ACTIVE under its prior owner and not available to purchase. The site runs on `*.vercel.app` until acquired; base URLs auto-resolve via `getSiteUrl()`. Brand text and contact emails in the privacy/disclaimer/contribute pages still reference `cc0-lib.wtf`.
8. **Soft 404s.** Unmatched routes render the not-found page but return HTTP 200 (a side-effect of the `src/app/[...not-found]` catch-all workaround). Acceptable but suboptimal for SEO; may be revisitable on Next 16.

## Dependency Summary

**Before:** 52 dependencies (Bundlr, Notion, wagmi, SIWE, Vercel KV, Redis, Pinecone, LangChain, ethers, etc.)
**After:** 25 total — 21 runtime (Next.js, React, Tailwind, Radix context-menu/toast, framer-motion, lucide-react, next-share, react-iframe, react-fast-marquee, rive, zod) + 4 dev (`@types/node`, `@types/react`, `tsx`, `typescript`). Standardized on **npm** (`package-lock.json`; `bun.lockb` removed).

## Last Verified

- `tsc --noEmit`: 0 errors
- `eslint src/**/*.{ts,tsx}`: 0 errors (10 pre-existing warnings)
- `next build`: Compiled successfully, 15/15 pages
- `next dev`: HTTP 200; Arweave images/videos loading via bare tx URLs + gateway fallback
- Pushed to `BeanInTheMachine/cc0-lib` (`main`)
