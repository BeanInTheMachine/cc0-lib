# cc0-lib Refactor — Project Summary

## Overview

The abandoned **cc0-lib** project (a Nouns DAO CC0 asset library) was refactored from a brittle server-dependent architecture into a **fully static, zero-OpEx, Git-driven public asset registry**. The original site broke due to dead external dependencies (Notion API, Bundlr SDK, Vercel KV, custom proxy servers, etc.). The refactored app drives recurring operational costs to **$0.00/month** by reading from a local compiled JSON index while delivering assets from permanently-paid Arweave storage.

## Architectural Decisions

| Decision | Reasoning |
|----------|-----------|
| **Static `metadata.json` index** | Replaces live Notion DB and Bundlr GraphQL queries. Single source of truth for the gallery. |
| **Arweave for file storage only** | All assets permanently stored on Arweave. Multi-gateway fallback (`arweave.net`, `ar-io.net`, `permaweb.io`) for delivery resilience. |
| **`<img>` + gateway rotation** | Plain `<img>` tags with `onError` rotation through gateways, bypassing Next.js image optimizer (which broke on Arweave redirects). |
| **Vercel Free Tier hosting** | Hybrid static + single serverless function for submissions. Not a pure static export. |
| **GitHub API submit endpoint** | Serverless `POST /api/submit` uses `GITHUB_TOKEN` to fetch → append → commit `metadata.json`, triggering Vercel redeploy. |
| **No auth for browsing** | Public read-only gallery. Submit endpoint protected by `SUBMIT_SECRET` Bearer token. |
| **Local logos** | `cc0-lib.wtf` domain is unreachable — SVGs stored in `/public/`. |
| **Notion data lost** | The `notion-api.splitbee.io` proxy returns HTTP 500. Rich metadata (titles, descriptions, tags) is unrecoverable. Current catalog built from Arweave transaction tags only. |

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      DATA LAYER (Storage)                        │
│  Arweave — permanently paid transactions, multi-gateway delivery │
│  Gateways: arweave.net → ar-io.net → permaweb.io                │
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
# Required for POST /api/submit
SUBMIT_SECRET=             # Shared secret Bearer token
GITHUB_TOKEN=              # GitHub PAT with repo contents read/write
GITHUB_OWNER=              # GitHub username or org
GITHUB_REPO=               # Repository name
```

No other env vars are needed. The app works without any env vars for read-only browsing.

## File Inventory

### New Files Created (7)

| File | Purpose |
|------|---------|
| `scripts/import-legacy.ts` | One-time script: queries Arweave GraphQL for `App: "cc0-lib uploader"` transactions, builds `metadata.json` |
| `src/data/metadata.json` | Static catalog — array of `Item` objects (2,797 entries after dedup) |
| `src/data/unmapped-assets.json` | Arweave transactions not found in Notion (empty — Notion extraction failed) |
| `src/lib/metadata.ts` | Central data access: `readMetadata()`, `getItemBySlug()`, filtering/search helpers, `slugify()`, `shuffle()` |
| `src/lib/gateway-url.ts` | Multi-gateway Arweave URL builder + `extractArweaveId()` |
| `src/lib/constants.ts` | Static page list, `DEV_MODE`, `SAMPLE_ENS` |
| `src/app/api/submit/route.ts` | Serverless submit endpoint — GitHub API commit flow |
| `src/components/ui/gateway-image.tsx` | Client component: `<img>` with `onError` fallback rotation through Arweave gateways |
| `public/cc0lib.svg` | Local square logo (original domain unreachable) |
| `public/cc0lib-h.svg` | Local horizontal logo |
| `.env.example` | Documented env vars |

### Key Modified Files (11)

| File | Changes |
|------|---------|
| `src/app/page.tsx` | Replaced `getPublishedItems()` with `readMetadata()` |
| `src/app/[slug]/page.tsx` | Replaced Notion fetch with `getItemBySlug()`; removed KV comments, page views, FC comments, `getDateFromItem()`; fixed Next.js 16 `params` Promise |
| `src/app/front-page.tsx` | Replaced `<Image>` with `<GatewayImage>`; removed ConnectButton, Vercel Analytics, wagmi; logos to local paths; index-suffixed keys |
| `src/app/fav/page.tsx` | Replaced `getPublishedItems()` with `readMetadata()` |
| `src/app/fav/fav-page.tsx` | Replaced `<Image>` with `<GatewayImage>`; removed SIWE/Redis/wagmi; localStorage-only likes; index-suffixed keys |
| `src/app/leaderboard/page.tsx` | Replaced `getPublishedItems()` + `handleENSLeaderboard` with `readMetadata()` + `getLeaderboard()` |
| `src/app/random/page.tsx` | Replaced `getPublishedItems()` with `readMetadata()`; removed `revalidatePath` server action |
| `src/app/sitemap.tsx` | Replaced `getPublishedItems()` with `readMetadata()`; updated constant imports |
| `src/app/sitemap/page.tsx` | Same as above |
| `src/app/layout.tsx` | Removed Web3Provider, Vercel Analytics, Karbon Kore analytics script |
| `src/lib/utils.ts` | Stripped `getData`, `getParsedItems`, `getPublishedItems`, `getRawItems`, `getDraftItems`, `getDateFromItem`, `getRepliesFromFC`, `handleENSLeaderboard`; kept `cn`, `getLikedItems`, `blobSize`, `bytesToString`, `copyToClipboard` |
| `src/components/ui/header.tsx` | Removed ConnectButton; logos to local paths |
| `src/components/data/sentiment.tsx` | Removed wagmi, SIWE, Redis, Vercel Analytics; localStorage-only |
| `next.config.js` | Removed custom cloudflare image loader, CORS headers, webpack polyfills; added `arweave.net`, `placehold.co`, `cc0-lib.wtf`, `api.cloudnouns.com` to remotePatterns |
| `package.json` | Removed 14 dead deps (Bundlr, Notion, Pinecone, Upstash, Vercel KV, Redis, LangChain, SIWE, wagmi, viem, ethers, connectkit, etc.); added `zod`, `tsx`; bumped version to 2.0.0 |
| `tsconfig.json` | Excluded `scripts/` directory; installed `@types/node` |
| `src/typing.d.ts` | Removed `ExtendedItem`, `LCItem`, `LCResponse`, `FCReply`, `APIData`; added `UnmappedAsset` |
| `PROJECT.md` | This file |

### Deleted Files/Directories (~20)

- `src/app/dashboard/` (entire Notion-based submission management tree)
- `src/app/draft/` (Notion draft view)
- `src/app/companion/` (desktop app download)
- `src/app/submit/` (old NotionForms iframe)
- `src/app/log/` (changelog)
- `src/app/loading-test/`, `src/app/rive-test/` (test pages)
- `src/app/api/data/`, `notion/`, `random/`, `embedding/`, `fc/`, `bundlr/` (all dead API routes)
- `src/pages/api/auth/siwe/` (SIWE auth)
- `src/lib/notion/` (Notion SDK utils)
- `src/lib/siwe/` (SIWE client/server config)
- `src/lib/redis.ts` (Vercel KV)
- `src/lib/constant.ts` (replaced by `constants.ts`)
- `src/lib/types/` (Farcaster + Bundlr types)
- `src/middleware.ts` (uploader gate)
- `src/components/dashboard/` (dashboard components)
- `src/components/fc/` (Farcaster comments)
- `src/components/web3/` (wagmi provider + connect button)
- `src/components/data/comments.tsx`, `page-views.tsx` (KV-backed)
- `src/hooks/` (useLocalStorage, no longer needed)

## Type System

**Core type — `Item`** (global, declared in `src/typing.d.ts`):
```typescript
type Item = {
  id: string;           // Arweave transaction ID (or Notion UUID if recovered)
  Source: string;       // Original source URL
  Type: string;         // "Image" | "Video" | "Audio" | "3D" | "Working Files"
  "Social Link"?: string;
  Filetype: string;     // "PNG" | "MP4" | "GLB" | etc.
  ENS?: string;         // Uploader's ENS name
  Description: string;
  Thumbnails: ItemThumbnail[];
  Tags: string[];
  ID: number;           // Sequential numeric ID
  Title: string;
  File?: string;        // Direct file URL (Arweave)
  Status?: "published" | "draft";
  ParentDB?: string;
  ThumbnailURL?: string;
};
```

**Arweave items** built by import script populate: `id`, `Title` (from filename), `Description` (auto-generated), `Type`/`Filetype` (derived from Content-Type), `File`/`ThumbnailURL` (Arweave URLs), `ENS` (Uploader tag), `Tags` (`["cc0-lib-upload"]`).

## Key Components

| Component | File | Purpose |
|-----------|------|---------|
| `FrontPage` | `src/app/front-page.tsx` | Masonry gallery grid, search, filter by type/tag/format, infinite scroll |
| `DetailsPage` | `src/app/[slug]/page.tsx` | Item detail view — renders video, audio, 3D, Figma, PDF, images |
| `GatewayImage` | `src/components/ui/gateway-image.tsx` | Arweave-aware `<img>` with multi-gateway `onError` fallback |
| `LeaderboardPage` | `src/app/leaderboard/page.tsx` | Top contributors by ENS |
| `RandomPage` | `src/app/random/page.tsx` | Random item viewer |
| `FavPage` | `src/app/fav/fav-page.tsx` | localStorage-based favorites grid |
| `Sentiment` | `src/components/data/sentiment.tsx` | localStorage-based like/dislike |

## API Routes

Only one active route:

**`POST /api/submit`**
- Auth: `Authorization: Bearer {SUBMIT_SECRET}`
- Body: `{ arweaveId, title, description, type, filetype, tags, ens, source?, socialLink?, filename? }`
- Flow: Validate → construct Item → fetch metadata.json from GitHub API → append → commit to main → Vercel redeploys

## Known Limitations

1. **Notion metadata lost.** The `notion-api.splitbee.io` proxy is dead (HTTP 500). Rich titles, descriptions, source links, and custom tags from the original catalog are unrecoverable unless a backup exists.
2. **Arweave-only catalog.** Current items derive titles from filenames and types from Content-Type tags. Descriptions are auto-generated (`"Uploaded by {ENS}"`).
3. **No user authentication.** SIWE/wagmi removed. Favorites and sentiment are localStorage-only (per-device, not synced).
4. **No comments/views.** KV-backed comments and page views removed.
5. **No Farcaster integration.** `searchcaster.xyz` endpoint removed.
6. **No file upload.** Bundlr SDK removed. Users upload to Arweave independently and submit the TX ID via the API.
7. **2,816 Arweave transactions found.** 19 duplicates removed (2,797 unique items).
8. **Logo SVGs are placeholder.** Original logos from `cc0-lib.wtf` unreachable — simple brand SVGs created locally.

## Dependency Summary

**Before:** 52 dependencies (Bundlr, Notion, wagmi, SIWE, Vercel KV, Redis, Pinecone, LangChain, ethers, etc.)
**After:** 26 dependencies (Next.js, React, Tailwind, Radix UI, framer-motion, lucide-react, zod, tsx)

## Last Verified

- `tsc --noEmit`: 0 errors
- `eslint src/**/*.{ts,tsx}`: 0 errors (6 pre-existing warnings)
- `next build`: Compiled successfully, 16/16 pages
- `next dev`: Running, HTTP 200, images loading with gateway fallback
