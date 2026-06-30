# cc0-lib Refactor — Project Summary

## Overview

The abandoned **cc0-lib** project (a Nouns DAO CC0 asset library) was refactored from a brittle server-dependent architecture into a **fully static, zero-OpEx, Git-driven public asset registry**. The original site broke due to dead external dependencies (Notion API, Bundlr SDK, Vercel KV, custom proxy servers, etc.). The refactored app drives recurring operational costs to **$0.00/month** by reading from a local compiled JSON index while delivering assets from permanently-paid Arweave storage.

A public upload page (`/upload`) was added in v2.2.0, allowing users to upload files directly to Arweave via the ar.io Turbo SDK and have them automatically added to the library. Free for files ≤100KB; paid via crypto (USDC on Base) for larger files.

## Current Status

- **Code:** Rebuilt, cleaned, and verified (`next build` green). Multiple UX hardening passes applied. Upload page live — free (≤100KB) wallet-signed uploads verified to Arweave mainnet; paid (>100KB) blocked on a Turbo funding-credit race (see Known Limitations #14).
- **Repo:** Pushed to **https://github.com/BeanInTheMachine/cc0-lib** (public, `main`). The original `cc0-lib/cc0-lib` is kept as the `upstream` remote.
- **Hosting:** Vercel (Free Tier). Site runs on the auto-assigned `*.vercel.app` URL until a custom domain is attached.
- **Custom domain:** `cc0-lib.xyz` is the canonical domain (owned, live on Vercel) and the domain the Farcaster manifest + account association are signed for. **Current Vercel config is reversed from intent:** `www.cc0-lib.xyz` is the primary domain (serves `200`) and the apex `cc0-lib.xyz` `308`-redirects to it. Recommended fix: make the apex the primary domain and redirect `www → apex`, so the canonical URLs (and all `miniapp-*.png` assets) serve directly without a redirect hop. The codebase resolves its base URL dynamically (see below).
- **Resurrected by:** coolbeans1r.eth (Farcaster FID `369904`)
- **Version:** `2.2.0`.

## Architectural Decisions

| Decision | Reasoning |
|----------|-----------|
| **Static `metadata.json` index** | Replaces live Notion DB and Bundlr GraphQL queries. Single source of truth for the gallery. |
| **Arweave for file storage only** | All assets permanently stored on Arweave. Multi-gateway fallback (`arweave.net`, `ar-io.net`, `permaweb.io`) for delivery resilience. |
| **Bare Arweave tx URLs** | Assets are single data transactions served at `https://arweave.net/{txId}` — **not** path manifests. Appending the filename (`/{txId}/{filename}`) returns 404, so all `ThumbnailURL`/`File` values are the bare tx URL. |
| **`<img>` + gateway rotation** | Arweave assets render via `GatewayImage` (plain `<img>` with `onError` gateway rotation), bypassing the Next.js image optimizer (which broke on Arweave). `next/image` is still used only for the cloudnouns cursor PFP and the video-player overlay logo. |
| **Configurable site URL** | `getSiteUrl()` resolves the base URL in order: `NEXT_PUBLIC_SITE_URL` → Vercel's `VERCEL_PROJECT_PRODUCTION_URL` → fallback `https://cc0-lib.xyz`. Drives every canonical/OG/Twitter/sitemap/robots/share URL **and the Farcaster manifest + embeds**. Set `NEXT_PUBLIC_SITE_URL=https://cc0-lib.xyz` in production so all URLs agree on the canonical apex. |
| **Vercel Free Tier hosting** | Hybrid static + single serverless function for submissions. Not a pure static export. Auto-deploys on every push to `main`. |
| **GitHub API submit endpoint** | Serverless `POST /api/submit` uses `GITHUB_TOKEN` to fetch → append → commit `metadata.json`, triggering a Vercel redeploy. |
| **No auth for browsing** | Public read-only gallery. Submit endpoint is public with in-memory rate limiting (5 req / 10 min / IP). |
| **Real brand logos** | Original `cc0lib.svg` / `cc0lib-h.svg` were recovered from git history (`/public/`); the live `cc0-lib.wtf` asset host is unreachable. |
| **Notion data lost** | The `notion-api.splitbee.io` proxy returns HTTP 500. Rich metadata (titles, descriptions, tags) is unrecoverable. Current catalog built from Arweave transaction tags only. |
| **Farcaster Mini App** | The gallery doubles as a Farcaster Mini App: dynamic manifest, `sdk.actions.ready()` + safe-area handling, a "save app" prompt, and `fc:miniapp`/`fc:frame` embeds. No wallet/auth/notifications — stays $0 runtime OpEx. |
| **Per-asset embeds** | Every `/[slug]` asset page is its own shareable Mini App card (embed image = the asset's Arweave `ThumbnailURL`, fallback `miniapp-embed.png`). Drives a viral loop: any asset shared in a feed renders a launch card. |
| **Committed account association** | The signed domain-ownership proof (`accountAssociation`) is public, non-secret data, so it is committed directly in the manifest route (env vars optionally override). The Mini App is verified on deploy without manual Vercel env setup. |
| **Turbo SDK for uploads** | ar.io Turbo SDK (`@ardrive/turbo-sdk`) handles Arweave uploads. **All** uploads use the authenticated client (`uploadFile`) signed by the connected EIP-1193 wallet against prod `upload.ardrive.io`: free tier (≤100KB) signs a data item with no `fundingMode` (Turbo waives the fee — no cost, no gas) and paid tier (>100KB) attaches on-demand USDC funding. Rich Arweave tags (`App-Name: cc0-lib`, Title, Type, Filetype, Tags, ENS, Description) are embedded in every upload for full catalog rebuildability from Arweave GraphQL. |
| **Webpack bundler** | Next.js 16 defaults to Turbopack, but the Turbo SDK requires Node.js polyfills in the browser (`crypto`, `stream`, `buffer`, `process`) and intercepts `node:` scheme imports. Build scripts use `--webpack` flag to use the classic webpack bundler with a custom `NormalModuleFactory` plugin that remaps `node:stream` → `stream-browserify`, `node:crypto` → `crypto-browserify`, etc. No end-user performance impact — output JS/CSS is identical to Turbopack's. |

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      DATA LAYER (Storage)                        │
│  Arweave — permanently paid transactions, multi-gateway delivery │
│  Bare tx URLs: arweave.net/{txId} → ar-io.net → permaweb.io      │
│  New uploads via Turbo SDK (ardrive.io bundler)                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                   DATABASE LAYER (Index)                         │
│  src/data/metadata.json  —  single compiled static file         │
│  Built by scripts/import-legacy.ts  (run once, commit to git)   │
│  Updated by POST /api/submit → GitHub API commit → Vercel redeploy│
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                   COMPUTE LAYER (Hosting)                        │
│  Vercel Free Tier — Next.js hybrid static + serverless           │
│  Base URL resolved via getSiteUrl() (env-driven)                 │
│  POST /api/submit → GitHub API → commit metadata.json → redeploy │
│  GET /upload → Client: Turbo SDK upload → POST /api/submit      │
└─────────────────────────────────────────────────────────────────┘
```

On top of these three layers sits a **distribution layer**: the same Vercel
deployment is also consumed *inside Farcaster clients* as a Mini App (manifest +
`fc:miniapp` embeds + SDK). See the [Farcaster Mini App](#farcaster-mini-app)
section below.

## How to Run

```bash
# Development
npm run dev          # Starts on http://localhost:3000 (uses --webpack)

# Production build
npm run build        # TypeScript + Next.js build (uses --webpack)
npm start            # Serve production build

# Lint / Typecheck
npx eslint "src/**/*.{ts,tsx}"
npx tsc --noEmit

# Import legacy data (one-time)
npm run import-legacy     # Runs scripts/import-legacy.ts

# Generate video thumbnails (one-time, requires ffmpeg)
npx tsx scripts/generate-video-thumbnails.ts

# Deduplicate metadata (one-time)
npx tsx scripts/dedup-metadata.ts

# Generate Farcaster Mini App images (one-time)
npm run generate-miniapp-assets
```

## Environment Variables (`.env`)

```env
# Optional — public base URL for canonical/OG/sitemap/share links.
# On Vercel this auto-resolves from VERCEL_PROJECT_PRODUCTION_URL,
# falling back to https://cc0-lib.xyz. Set to override (e.g. custom domain).
NEXT_PUBLIC_SITE_URL=

# Required for POST /api/submit (commits new items to GitHub metadata.json)
GITHUB_TOKEN=              # GitHub PAT with repo contents read/write scope
GITHUB_OWNER=              # GitHub username or org (e.g. BeanInTheMachine)
GITHUB_REPO=               # Repository name (e.g. cc0-lib)

# Optional — WalletConnect project ID for the /upload page wallet modal.
# Get one at https://cloud.walletconnect.com/ (free).
# Without this, only injected wallets (MetaMask) are supported.
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# Optional — Farcaster Mini App account association (verified publishing).
# Generate at https://farcaster.xyz/~/developers/new for domain cc0-lib.xyz.
FARCASTER_HEADER=
FARCASTER_PAYLOAD=
FARCASTER_SIGNATURE=
```

The app works without any env vars for read-only browsing (and still launches
and embeds as a Mini App; only verified publishing needs the `FARCASTER_*` set).
The upload page works for browsing without env vars; actual file upload +
submission requires `GITHUB_TOKEN`/`GITHUB_OWNER`/`GITHUB_REPO`.
`SUBMIT_SECRET` was removed in v2.2.0 (submit endpoint is now public with rate limiting).

## Upload Page (`/upload`)

Added in v2.2.0. Allows users to upload CC0 assets directly to Arweave and have
them automatically added to the site catalog.

### Payment Tiers

| Tier | Max Size | Wallet Required | Cost |
|------|----------|-----------------|------|
| Free | ≤100KB | EIP-1193 (signature only) | $0 (no gas) |
| Paid | Unlimited | EIP-1193 (MetaMask, WalletConnect) | USDC on Base (on-demand funding) |

### Upload Flow

```
1. User drops file + fills metadata form
2. Connect wallet (required for all file uploads) → wrap EIP-1193 provider in an EthereumWalletAdapter
3. Free (≤100KB): TurboFactory.authenticated({ walletAdapter, token: 'base-usdc' }).uploadFile()
     → user signs the data item (no cost, no gas) → Arweave mainnet tx ID
4. Paid (>100KB): same + fundingMode: OnDemandFunding → user approves USDC on Base → Arweave mainnet tx ID
5. POST /api/submit → Git Data API commit to metadata.json → Vercel redeploys
6. Success page: primary "View on Arweave" link (instant) + secondary "View on site" link with a "may take ~60s to go live" note
```

### Arweave Tags for Rebuildability

Every upload embeds these tags directly on-chain so the entire catalog can be
reconstructed from Arweave GraphQL if `metadata.json` is ever lost:

| Tag | Value |
|-----|-------|
| `App-Name` | `cc0-lib` |
| `Content-Type` | MIME type (e.g. `image/png`) |
| `Title` | Asset title |
| `Type` | Category (Image/Video/Audio/3D/Working Files) |
| `Filetype` | File format (e.g. PNG) |
| `Tags` | Comma-separated keywords |
| `ENS` | Uploader ENS (optional) |
| `Description` | Asset description |

### Wallet Support

- **Injected** (MetaMask, Coinbase Wallet, Brave, Rainbow): detected via `window.ethereum`, requires no configuration
- **WalletConnect** (300+ wallets, QR code modal): requires `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` env var

Both paths wrap the EIP-1193 provider with ethers `BrowserProvider` and pass an `EthereumWalletAdapter` (`{ getSigner: () => cachedSigner }`) to the Turbo SDK. A wallet is required for **every** file upload (free uploads only sign a data item — no cost, no gas); the "Paste Arweave ID" mode needs no wallet.

### Turbo SDK Details

- **Upload service:** `upload.ardrive.io` (production, authenticated) for all uploads — both free and paid
- **On-demand funding:** Turbo SDK's `OnDemandFunding` class tops up USDC credits from the connected wallet in a single transaction during upload, with a 10% buffer (paid >100KB only)
- **File handling:** All uploads are wallet-signed data items via `uploadFile` (stream factory `fileStreamFactory` + `fileSizeFactory`). Free (≤100KB) omits `fundingMode` and relies on Turbo's free-tier waiver; paid (>100KB) attaches `OnDemandFunding`

### Submit API Changes (v2.2.0)

| Before | After |
|--------|-------|
| `SUBMIT_SECRET` Bearer auth required | Public, in-memory rate limiting (5 req / 10 min / IP) |
| ENS required (`.eth` suffix) | ENS optional |
| Slug via naive `slugify(title)` | Slug via `getItemSlug(item)` (title + last 6 chars of ID) |

## File Inventory

### New / Key Files

| File | Purpose |
|------|---------|
| `scripts/import-legacy.ts` | One-time script: queries Arweave GraphQL for `App: "cc0-lib uploader"` (legacy) AND `App-Name: "cc0-lib"` (new uploads); deduplicates by tx ID; builds `metadata.json` (bare tx URLs). Handles both old (`Filename`/`Uploader` tags) and new (`Title`/`Type`/`Filetype`/`Tags`/`ENS`/`Description` tags) formats. |
| `scripts/generate-video-thumbnails.ts` | One-time script: downloads each video, extracts a frame at 1s (or midpoint), saves to `public/thumbnails/`, patches `ThumbnailURL` in `metadata.json` |
| `scripts/dedup-metadata.ts` | One-time script: removes duplicate items sharing same title + type + filetype + ENS uploader |
| `src/data/metadata.json` | Static catalog — array of `Item` objects (1,916 entries after dedup of 2,797 → 1,916) |
| `src/lib/metadata.ts` | Central data access: `readMetadata()`, `getItemBySlug()`, `getItemSlug()`, `getLeaderboard()`, `slugify()`, `shuffle()`, `shortDomainName()` |
| `src/lib/gateway-url.ts` | `ARWEAVE_GATEWAYS` list + `extractArweaveId()` |
| `src/lib/site-url.ts` | `getSiteUrl()` — env-driven base URL resolver |
| `src/lib/constants.ts` | Static page list (incl. `"upload"`), `DEV_MODE` |
| `src/lib/upload/turbo-upload.ts` | Turbo SDK wrapper: `uploadFree()` (authenticated, ≤100KB, no `fundingMode` — relies on Turbo's free-tier waiver), `uploadPaid()` (authenticated + OnDemandFunding), `estimateCost()`, `isFreeUpload()`. Both upload via prod `upload.ardrive.io` and embed CC0-lib Arweave tags. |
| `src/app/api/submit/route.ts` | Public serverless submit endpoint — in-memory rate limiting (5/10min/IP), Zod validation (ENS optional), and a GitHub **Git Data API** commit flow (blob → tree → commit → update ref) with retry. Reads `metadata.json` via the Blob API so files >1 MB work (the Contents API omits content past 1 MB). Requires `GITHUB_TOKEN`/`GITHUB_OWNER`/`GITHUB_REPO` in all environments. |
| `src/app/upload/page.tsx` | Server RSC — page metadata (title, OG, Twitter cards) via `getSiteUrl()` |
| `src/app/upload/upload-page.tsx` | Client component (~400 lines) — drag-and-drop file zone with preview and size-based tier indicator, metadata form (title, description, type dropdown, filetype, tags, optional ENS), wallet connection (injected MetaMask + WalletConnect QR modal), cost estimate display, upload progress bar via Turbo SDK events, success page with Arweave + site URLs, error handling, "Paste Arweave ID" fallback tab |
| `src/app/robots.ts` | Dynamic robots (sitemap URL follows `getSiteUrl()`) |
| `src/app/sitemap.tsx` | Dynamic XML sitemap (URLs from `getSiteUrl()`) |
| `src/components/ui/gateway-image.tsx` | Client component: `<img>` with `onError` Arweave gateway rotation; styled file-type fallback cards (icon + title) for non-image types; `filetype` prop support |
| `public/cc0lib.svg` / `cc0lib-h.svg` | Real brand logos (restored from git history) |
| `public/thumbnails/` | 7 generated video thumbnail JPGs (committed to repo) |
| `.env.example` | Documented env vars (updated: removed `SUBMIT_SECRET`, added `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`) |
| `scripts/generate-miniapp-assets.ts` | One-time script (sharp): generates Farcaster Mini App images from brand SVGs — `miniapp-icon.png` (1024², no alpha), `miniapp-splash.png` (200²), `miniapp-embed.png` (1200×800, 3:2), `miniapp-hero.png` (1200×630) |
| `src/app/.well-known/farcaster.json/route.ts` | Dynamic Mini App manifest (`force-static`) — `miniapp` config + optional `accountAssociation` from env; all URLs via `getSiteUrl()` |
| `src/lib/miniapp-embed.ts` | `buildEmbed()` — returns `{ "fc:miniapp", "fc:frame" }` embed meta for the Next `metadata.other` field |
| `src/components/miniapp/miniapp-provider.tsx` | Client provider: lazy-loads SDK, calls `sdk.actions.ready()`, applies `safeAreaInsets` as CSS vars, exposes `useMiniApp()` context (`inMiniApp`, `added`) |
| `src/components/miniapp/save-app-button.tsx` | Header "save app" button — shown only inside a Farcaster client (and when not already added); calls `sdk.actions.addMiniApp()` |
| `public/miniapp-*.png` | Generated Mini App icon/splash/embed/hero images |

### Key Modified Files (v2.2.0)

| File | Changes |
|------|---------|
| `package.json` | Added 7 deps: `@ardrive/turbo-sdk`, `@walletconnect/ethereum-provider`, `ethers`, `crypto-browserify`, `stream-browserify`, `buffer`, `process`. Changed `dev` and `build` scripts to `--webpack` flag. Version → 2.2.0. |
| `next.config.js` | Added webpack polyfill config: browser polyfills (crypto, stream, buffer, process via fallback + ProvidePlugin), custom `NormalModuleFactory` plugin that intercepts `node:*` scheme imports and remaps to browser equivalents (`node:stream` → `stream-browserify`, `node:crypto` → `crypto-browserify`, `node:fs/http/https/net/tls` → false). |
| `src/app/api/submit/route.ts` | Removed `SUBMIT_SECRET` Bearer auth requirement. Made ENS optional in Zod schema. Added in-memory IP-based rate limiting (5 requests per 10 minutes). Uses `getItemSlug()` for consistent title+ID-suffix slugs. |
| `src/lib/constants.ts` | Added `"upload"` to static pages |
| `src/typing.d.ts` | Added `window.ethereum` type declaration for injected wallet detection |
| `scripts/import-legacy.ts` | `fetchArweaveTransactions()` now accepts tag filters as a parameter. `arweaveNodeToMetadataItem()` handles both old format (`App`/`Filename`/`Uploader` tags) and new format (`App-Name`/`Title`/`Type`/`Filetype`/`Tags`/`ENS`/`Description` tags). `main()` queries both tag sets and deduplicates by Arweave ID. |
| `.env.example` | Removed `SUBMIT_SECRET`, added `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` |
| `src/app/page.tsx` | `readMetadata()`; metadata URLs via `getSiteUrl()` |
| `src/app/[slug]/page.tsx` | `getItemBySlug()`; Next 16 `params` Promise; `next/image` → `GatewayImage`; metadata + `SocialShare baseUrl` via `getSiteUrl()`; links use `getItemSlug()`; GatewayImage calls pass `filetype` prop; video poster attribute |
| `src/app/front-page.tsx` | `<GatewayImage>` with `filetype` prop; links use `getItemSlug()` unique slugs; gallery limit 6→18; removed Web3/analytics; real horizontal logo; "coolbeans loves you" ticker segment |
| `src/app/fav/*` | `readMetadata()`; `<GatewayImage>` with `filetype` prop; localStorage-only likes; links use `getItemSlug()` |
| `src/app/leaderboard/page.tsx` | `readMetadata()` + `getLeaderboard()` |
| `src/app/random/page.tsx` | `readMetadata()`; `next/image` → `GatewayImage` with `filetype` prop; links use `getItemSlug()`; site URL |
| `src/app/sitemap.tsx` / `sitemap/page.tsx` | `readMetadata()`; URLs via `getSiteUrl()` and `getItemSlug()` |
| `src/app/info/page.tsx` | Removed dead-route cards; added "resurrected" section; updated donation/support/ideas text; farcaster links; (dead) marker on archives.wtf; "contribute" card now links to `/upload` |
| `src/app/privacy/page.tsx`, `disclaimer/page.tsx` | URL references updated `cc0-lib.wtf` → `cc0-lib.xyz`; email contacts → farcaster links; dates updated to 27th June 2026 |
| `src/app/layout.tsx` | Removed Web3Provider/analytics; added `metadataBase` from `getSiteUrl()` |
| `src/components/ui/video-player.tsx` | Logo → local `/cc0lib.svg`; added `poster={data.ThumbnailURL}` to video elements |
| `src/components/ui/social-share.tsx` | Share/embed URLs via `baseUrl` + `getItemSlug(data)` |
| `src/components/ui/gateway-image.tsx` | Added `filetype` prop; styled fallback cards with lucide-react icons (FolderArchive, FileText, FileImage, File) for non-image types; fallback div for broken images |
| `src/lib/utils.ts` | Stripped dead helpers; kept `cn`, `getLikedItems`, `blobSize` |
| `src/lib/metadata.ts` | Added `getItemSlug(item)` — unique slugs via `title-last6chars`; updated `getItemBySlug()` to match by ID suffix with title fallback |
| `src/data/metadata.json` | Deduplicated: 2,797 → 1,916 items (881 same-title+type+filetype+ENS duplicates removed); video ThumbnailURLs point to local `/thumbnails/` |

### Deleted Files/Directories

**Original refactor (~20):** `src/app/dashboard/`, `draft/`, `companion/`, `submit/`, `log/`, `loading-test/`, `rive-test/`; dead API routes (`api/data`, `notion`, `random`, `embedding`, `fc`, `bundlr`); `src/pages/api/auth/siwe/`; `src/lib/notion/`, `siwe/`, `redis.ts`, `constant.ts`, `types/`; `src/middleware.ts`; `src/components/dashboard/`, `fc/`, `web3/`; `data/comments.tsx`, `page-views.tsx`; `src/hooks/`.

**Cleanup pass:** `src/app/api/page.tsx` + `api/endpoint.ts` (stale `/api` docs), `src/lib/image-loader.ts`, `src/data/unmapped-assets.json`, `src/components/data/copy.tsx`, `data/image-dl.tsx`, `data/sentiment.tsx`, `ui/loading-text.tsx`, `ui/badge.tsx`, `ui/tooltip.tsx`, `ui/accordion.tsx`, `public/vercel.svg`, `public/next.svg`, `public/loading.riv`, `src/app/robots.txt` (→ `robots.ts`), `bun.lockb`, `src/app/contribute/` (contribute page removed; all `/contribute` links across the front page, info page, footer, and leaderboard now point to `/upload`, and `"contribute"` was dropped from `staticPages` in `src/lib/constants.ts`).

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

**Arweave items** built by the import script populate: `id`, `Title` (from filename or `Title` tag), `Description` (auto-generated or from `Description` tag), `Type`/`Filetype` (derived from Content-Type or explicit tags), `File`/`ThumbnailURL` (bare Arweave URLs), `ENS` (Uploader or ENS tag), `Tags` (`["cc0-lib-upload"]` plus user-provided tags).

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
| `UploadPage` | `src/app/upload/upload-page.tsx` | File upload: drag-drop, metadata form, wallet connect, progress, Arweave + GitHub submission |

## API Routes

### `POST /api/submit`

- **Auth:** Public (no auth required). Rate limited to 5 requests per 10 minutes per IP.
- **Body:** `{ arweaveId, title, description, type, filetype, tags, ens?, source?, socialLink?, filename? }`
- **Flow:** Validate (Zod, ENS optional) → construct Item (bare Arweave URL) → read `metadata.json` via the GitHub **Git Data API** (Blob API; supports files >1 MB, unlike the Contents API which omits content past 1 MB) → assign sequential ID → append → commit via Git Data API (blob → tree → commit → update ref) on `main` → Vercel redeploys
- **Response:** `{ id, title, slug, url }`

## Farcaster Mini App

The gallery is also a **Farcaster Mini App** — it launches inside Farcaster
clients (Farcaster app, Base app, etc.) and every page is shareable as a rich
embed card. Scope is intentionally minimal (launch + share + save); there is
**no wallet, auth, notifications, or file upload**, so runtime OpEx stays
**$0.00/month**.

### How it works

| Piece | Implementation |
|-------|----------------|
| **Manifest** | `GET /.well-known/farcaster.json` via `src/app/.well-known/farcaster.json/route.ts` (`force-static`). Returns `accountAssociation` + `miniapp` config; every URL built from `getSiteUrl()`. |
| **Account association** | Signed domain-ownership proof for `cc0-lib.xyz` (Farcaster **FID 369904**, custody key `0xa02C…d4E2`, payload `{"domain":"cc0-lib.xyz"}`). Public, non-secret data **committed in the route**; `FARCASTER_HEADER/PAYLOAD/SIGNATURE` env vars override it. The app is therefore a **verified** Mini App on deploy. |
| **SDK bootstrap** | `MiniAppProvider` (`src/components/miniapp/miniapp-provider.tsx`) lazy-imports `@farcaster/miniapp-sdk`, calls `sdk.actions.ready()` (dismisses the splash — the #1 gotcha), and writes `client.safeAreaInsets` to CSS vars (`--fc-safe-*`, consumed by `body` padding in `globals.css`). Mounted in `layout.tsx`. |
| **Save prompt** | `SaveAppButton` (`src/components/miniapp/save-app-button.tsx`) renders a header "save app" item **only inside a Farcaster client and when not already added**; calls `sdk.actions.addMiniApp()`. |
| **Embeds (sharing)** | `buildEmbed()` (`src/lib/miniapp-embed.ts`) returns `{ "fc:miniapp", "fc:frame" }` for the Next `metadata.other` field. Added on the homepage (`page.tsx`, button "Browse CC0 assets") and **every `/[slug]` asset page** (`[slug]/page.tsx`, button "View asset"). |
| **Per-asset viral loop** | Each asset's embed image is its Arweave `ThumbnailURL` (fallback `miniapp-embed.png`), so any asset shared in a feed renders its own launch card. |

### Manifest config (`miniapp`)

`version 1`, `name "CC0-LIB"`, `homeUrl`/`iconUrl`/`splashImageUrl`/
`heroImageUrl`/`ogImageUrl` from `getSiteUrl()`, `splashBackgroundColor
"#18181b"`, `primaryCategory "art-creativity"`, `tags ["cc0","assets","nouns",
"library","design"]`, plus `subtitle`/`description`/`tagline`/`ogTitle`/
`ogDescription`, `noindex false`.

### Image assets

Generated by `scripts/generate-miniapp-assets.ts` (sharp) from the brand SVGs
(`cc0lib-c.svg` mark + `cc0lib-h.svg` wordmark on `#18181b`), committed to
`/public`. Run via `npm run generate-miniapp-assets`:

| File | Size | Use |
|------|------|-----|
| `miniapp-icon.png` | 1024×1024, **no alpha** | manifest `iconUrl` |
| `miniapp-splash.png` | 200×200 | splash / launch loading screen |
| `miniapp-embed.png` | 1200×800 (3:2) | homepage embed + per-asset fallback |
| `miniapp-hero.png` | 1200×630 | `heroImageUrl` / `ogImageUrl` |

### Domain consistency (action item)

Farcaster treats `cc0-lib.xyz` and `www.cc0-lib.xyz` as **different apps**, so the
hosting domain must match the signed association (`cc0-lib.xyz`, apex).
**Currently Vercel serves `www` as primary and the apex `308`-redirects to it** —
the reverse of intent. It still works (clients follow the redirect) but adds a
redirect hop to `homeUrl` and to every `miniapp-*.png`, which can cause gray/
missing embed images in feed scrapers that don't follow redirects. **Fix:** in
Vercel → Settings → Domains, set the apex `cc0-lib.xyz` as **primary** and
redirect `www → apex`.

### Testing

- Local embed/preview needs a public tunnel (e.g. `cloudflared tunnel --url
  http://localhost:3000`); open the tunnel URL in a browser once before using it
  in the Warpcast tools.
- Validate the manifest + embeds with the Warpcast Mini App / Embed debugger;
  enable **Developer Mode** in Farcaster settings first.

## Known Limitations

1. **Notion metadata lost.** The `notion-api.splitbee.io` proxy is dead (HTTP 500). Rich titles, descriptions, source links, and custom tags from the original catalog are unrecoverable unless a backup exists.
2. **Arweave-only catalog.** Items derive titles from filenames and types from Content-Type tags. Descriptions are auto-generated. New uploads use explicit tags for richer metadata.
3. **No user authentication.** SIWE/wagmi removed. Favorites are localStorage-only (per-device, not synced).
4. **No comments/views.** KV-backed comments and page views removed.
5. **Farcaster Mini App (launch + share + save).** The app runs as a Farcaster Mini App: dynamic manifest at `/.well-known/farcaster.json` (`src/app/.well-known/farcaster.json/route.ts`, env-driven via `getSiteUrl()`), `sdk.actions.ready()` + safe-area handling via `MiniAppProvider`, a "save app" prompt (`sdk.actions.addMiniApp()`), and `fc:miniapp`/`fc:frame` embeds on the homepage and every `/[slug]` asset page (per-asset embeds reuse the Arweave `ThumbnailURL`). **No file upload** — users upload to Arweave independently and submit the TX ID via the API. The signed `accountAssociation` for `cc0-lib.xyz` (Farcaster FID 369904, apex canonical) is committed in the manifest route, so the app is a verified Mini App; the `FARCASTER_HEADER/PAYLOAD/SIGNATURE` env vars optionally override it on a domain/account change.
6. **Catalog size.** 2,816 Arweave transactions found; 881 same-title+type+filetype+ENS duplicates removed → 1,916 unique items (7 videos, ~21 Working Files, rest Images/GIFs/Audio/3D).
7. **Canonical domain / redirect direction.** `cc0-lib.xyz` is owned and live on Vercel and is the intended canonical apex (and the domain the Mini App is signed for). **However, Vercel currently has `www` as the primary domain and the apex `308`-redirects to `www`** — the reverse of intent; set the apex as primary and redirect `www → apex` (see [Farcaster Mini App → Domain consistency](#farcaster-mini-app)). Base URLs resolve via `getSiteUrl()`; set `NEXT_PUBLIC_SITE_URL=https://cc0-lib.xyz` in production.
8. **Soft 404s.** Unmatched routes render the not-found page but return HTTP 200 (a side-effect of the `src/app/[...not-found]` catch-all workaround). Acceptable but suboptimal for SEO; may be revisitable on Next 16.
9. **Working Files previews.** Items like ZIP/CSV/JSON/PLAIN have no visual thumbnail — they render as styled file-type fallback cards (icon + title) in the gallery.
10. **Video thumbnails.** 7 videos have pre-generated local thumbnails. New video submissions would need the thumbnail generation script re-run.
11. **Free uploads are wallet-signed (mainnet).** Attempts to offer free uploads *without* a wallet failed: prod `upload.ardrive.io` 404s the unsigned x402 endpoint (`POST /x402/data-item/unsigned`), and the staging `upload.ardrive.dev` accepts unsigned x402 data but does **not** persist it to Arweave mainnet — verified for a real upload (`arweave.net/graphql` returned `transaction: null` and every production gateway 404'd the data item; only `*.dev` gateways recognized it). So free uploads now use the **authenticated** client (`uploadFile` signed by the connected EIP-1193 wallet, no `fundingMode`) against prod `upload.ardrive.io`: the user signs a data item (no cost, no gas), Turbo waives the ≤100KB fee, and it posts to mainnet. Every file upload therefore requires a wallet (the "Paste Arweave ID" mode does not).
12. **Vercel redeploy lag.** After a successful upload + GitHub commit, it takes ~60 seconds for Vercel to redeploy and the new asset to appear on the site. The success page surfaces the instant Arweave URL as the primary "View on Arweave" link and the site URL as a secondary "View on site" link with a "may take ~60s to go live" note.
13. **Webpack-only build.** Next.js 16 defaults to Turbopack, but the `node:` scheme polyfills required by the Turbo SDK only work with webpack. `dev` and `build` scripts use `--webpack`. No runtime performance difference — output JS/CSS is identical.

14. **Paid uploads (>100KB) are broken — funding race (OPEN, money-sensitive).** With `OnDemandFunding`, Turbo broadcasts the USDC-on-Base funding tx, then calls `submitFundTransaction` (`POST /account/balance/base-usdc`) to credit it. That credit call can fail before the tx is confirmed/visible on Base, throwing `Failed to submit fund transaction! ... 'turbo.submitFundTransaction(id)': <txId>` (`@ardrive/turbo-sdk .../payment.js:328`) and aborting the upload — **before** the SDK's own retry loop (`upload.js:664`) runs. The on-chain USDC payment succeeds but is never credited; funds are recoverable (not lost) via `turbo.submitFundTransaction({ txId })` once the tx confirms (credits land on the wallet's Turbo balance). **Do NOT just retry a failed paid upload — it broadcasts a second USDC tx and double-charges.** Stranded test payment: Base tx `0x7132978a183efa24b79d8d9e70fa0736b2fd55a28b3794a28e30d24ef93d0c9e`. Fix not yet implemented — see Open Issues.
15. **Fresh-upload gateway propagation.** Right after a wallet-signed upload, ar.io gateways (e.g. `arweave.net`) can briefly return `404 — This hashpath cannot be resolved on this node, yet.` while the fleet indexes the new Turbo data item; it resolves within minutes (verified: the test AVIF served `image/avif` 200 from `arweave.net` and `turbo-gateway.com` shortly after). The data is on mainnet the whole time. Proposed hardening (not implemented): add `https://turbo-gateway.com` to `ARWEAVE_GATEWAYS` (serves Turbo uploads instantly) and drop `https://permaweb.io` (returns only a 114-byte HTML stub, never valid image data).

## Dependency Summary

**Before v2.2.0:** 27 total — 22 runtime + 5 dev.
**After v2.2.0:** 34 total — 29 runtime (`@ardrive/turbo-sdk`, `@walletconnect/ethereum-provider`, `ethers`, `crypto-browserify`, `stream-browserify`, `buffer`, `process` added) + 5 dev. Standardized on **npm**.

## Open Issues / Next Session

1. **Fix paid uploads (funding race) — priority.** Plan (not built): in `uploadPaid`, catch the `Failed to submit fund transaction` error, extract the `0x…` tx id, poll `turbo.submitFundTransaction({ txId })` until `status === 'confirmed'`, then retry `uploadFile` against the credited balance (no second charge); show a "Payment received — confirming…" state. Optional safety net: persist the tx id to `localStorage` with a "Resume" prompt.
2. **Recover stranded payment** `0x7132978a183efa24b79d8d9e70fa0736b2fd55a28b3794a28e30d24ef93d0c9e` via `turbo.submitFundTransaction({ txId })` (same wallet, `token: 'base-usdc'`).
3. **Optional gateway hardening** (proposed, not implemented): add `https://turbo-gateway.com`, drop `https://permaweb.io` in `src/lib/gateway-url.ts`.
4. **WalletConnect for all uploads.** Every file upload now needs a wallet — set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in Vercel for users without an injected wallet.
5. **Version mismatch.** `package.json` is `2.0.0` vs documented v2.2.0 — bump to match (consider v2.3.0 for the wallet-signed upload work).

## Last Verified

- `tsc --noEmit`: 0 errors · `eslint`: 0 errors (pre-existing `<img>`/exhaustive-deps warnings only)
- **Free upload (≤100KB): VERIFIED end-to-end on production.** Wallet-signed `uploadFile` via prod `upload.ardrive.io` → real Arweave mainnet data item → `POST /api/submit` (Git Data API) → committed to `metadata.json`. Live example: "Coolbeans Basepaint JoeC" (AVIF, tx `1AC93ihBwjWl_A59sfTRqqDTYgI5LXGRFJudnW3rJLM`) served `image/avif` (200) from `arweave.net` + `turbo-gateway.com`.
- **Git Data API submit: VERIFIED in production** — real submit commits `a37ee22`, `4e4bb5f` appended to the >1MB `metadata.json`.
- **Paid upload (>100KB): NOT WORKING** — funding race strands the USDC payment (see Known Limitation #14).
- **Farcaster Mini App:** manifest live + verified; apex still `308`-redirects to `www` (flip in Vercel).
- Latest push: `BeanInTheMachine/cc0-lib` `main` @ `e9060e4` (+ prod submit `4e4bb5f`).
- Catalog: **1,917 items** — 1,916 legacy + 1 live user upload ("Coolbeans Basepaint JoeC", ID 2795).
