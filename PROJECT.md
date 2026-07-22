# cc0-lib Refactor — Project Summary

## Overview

The abandoned **cc0-lib** project (a Nouns DAO CC0 asset library) was refactored from a brittle server-dependent architecture into a **fully static, zero-OpEx, Git-driven public asset registry**. The original site broke due to dead external dependencies (Notion API, Bundlr SDK, Vercel KV, custom proxy servers, etc.). The refactored app drives recurring operational costs to **$0.00/month** by reading from a local compiled JSON index while delivering assets from permanently-paid Arweave storage.

A public upload page (`/upload`) was added in v2.2.0, allowing users to upload files directly to Arweave via the ar.io Turbo SDK and have them automatically added to the library. Free for files ≤100KB; paid via crypto (USDC on Base) for larger files.

## Current Status

- **Code:** Rebuilt, cleaned, and verified (`next build` green). Multiple UX hardening passes applied. Upload page live — free (≤100KB) wallet-signed uploads verified to Arweave mainnet; paid (>100KB) re-enabled with chain detection, USDC balance checks, and funding race recovery.
- **Moderation pipeline:** Added in v2.4.0. New uploads start with `SubmissionStatus: "submitted"` and are hidden from galleries/search/sitemaps until reviewed. Legacy items (no `SubmissionStatus`) remain visible. The detail page shows an amber "Pending review" badge on unmoderated items. A Hermes Agent cron job (VPS-hosted) runs daily to auto-approve safe content via vision + magic-byte checks. See [Content Moderation Pipeline](#content-moderation-pipeline) below.
- **Repo:** Pushed to **https://github.com/BeanInTheMachine/cc0-lib** (public, `main`). The original `cc0-lib/cc0-lib` is kept as the `upstream` remote.
- **Hosting:** Vercel (Free Tier).
- **Custom domain:** `cc0-lib.xyz` is the canonical domain (owned, live on Vercel). **Current Vercel config is reversed from intent:** `www.cc0-lib.xyz` is the primary domain (serves `200`) and the apex `cc0-lib.xyz` `308`-redirects to it. Fix: make the apex primary, redirect `www → apex`.
- **Resurrected by:** coolbeans1r.eth (Farcaster FID `369904`)
- **Version:** `2.5.0`.

## Architectural Decisions

| Decision | Reasoning |
|----------|-----------|
| **Static `metadata.json` index** | Replaces live Notion DB and Bundlr GraphQL queries. Single source of truth for the gallery. |
| **Arweave for file storage only** | All assets permanently stored on Arweave. Multi-gateway fallback (`arweave.net`, `ar-io.net`, `turbo-gateway.com`) for delivery resilience. `turbo-gateway.com` serves fresh Turbo uploads instantly (before bundle confirmation on Arweave mainnet). |
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
│  Bare tx URLs: arweave.net/{txId} → ar-io.net → turbo-gateway.com       │
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

| Tier | Max Size | Wallet Required | Cost | Status |
|------|----------|-----------------|------|--------|
| Free | ≤100KB | EIP-1193 (signature only) | $0 (no gas) | Live |
| Paid | Unlimited | EIP-1193 (MetaMask, WalletConnect) | USDC on Base | Live — auto-detects Base chain, checks USDC+ETH balance |

**Chain requirements for paid:** Wallet must be on **Base (chain 8453)** with USDC for the upload fee + ~0.0005 ETH for gas. If on the wrong chain, a "Switch to Base" button prompts the wallet to switch. USDC and ETH balances are checked before enabling the submit button.

### Upload Flow

```
1. User drops file + fills metadata form
2. Connect wallet (required for all file uploads) → wrap EIP-1193 provider in an EthereumWalletAdapter
3. Free (≤100KB): TurboFactory.authenticated({ walletAdapter, token: 'base-usdc' }).uploadFile()
     → user signs the data item (no cost, no gas) → Arweave mainnet tx ID
4. Paid (>100KB): wallet signs USDC payment via OnDemandFunding on Base, funding race auto-retry with polling, upload to Arweave
5. POST /api/submit → Git Data API commit to metadata.json → Vercel redeploys
6. Success page: primary "View image" link (turbo-gateway.com — instant) + secondary "View on site" link with "may take a few hours to appear" note
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
- **On-demand funding:** Built but disabled — `OnDemandFunding` class tops up USDC credits from the connected wallet during upload with a 10% buffer (requires Base USDC). A funding race retry/poll mechanism (`pollForFundConfirmation`, `resumeFunding`) is implemented in `turbo-upload.ts` for when re-enabled.
- **File handling:** All uploads are wallet-signed data items via `uploadFile` (stream factory `fileStreamFactory` + `fileSizeFactory`). Free (≤100KB) omits `fundingMode` and relies on Turbo's free-tier waiver.

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
| `src/lib/gateway-url.ts` | `ARWEAVE_GATEWAYS` list (`arweave.net`, `ar-io.net`, `turbo-gateway.com`) + `extractArweaveId()`. `turbo-gateway.com` serves fresh Turbo uploads instantly; `permaweb.io` removed (returned 200 OK HTML stub that blocked `<img>` `onError` fallback). |
| `src/lib/site-url.ts` | `getSiteUrl()` — env-driven base URL resolver |
| `src/lib/constants.ts` | Static page list (incl. `"upload"`), `DEV_MODE` |
| `src/lib/upload/turbo-upload.ts` | Turbo SDK wrapper: `uploadFree()` (authenticated, ≤100KB, no `fundingMode`), `uploadPaid()` (authenticated + OnDemandFunding with funding race retry + `pollForFundConfirmation` + `resumeFunding`), `estimateCost()`, `isFreeUpload()`, `getStrandedFundingTx()` / `clearStrandedTx()` (localStorage crash recovery). `UploadProgress` callback type for UI funding/confirming feedback. Both upload via prod `upload.ardrive.io` and embed CC0-lib Arweave tags. |
| `src/app/api/submit/route.ts` | Public serverless submit endpoint — in-memory rate limiting (5/10min/IP), Zod validation (ENS optional), and a GitHub **Git Data API** commit flow (blob → tree → commit → update ref) with retry. Reads `metadata.json` via the Blob API so files >1 MB work (the Contents API omits content past 1 MB). Requires `GITHUB_TOKEN`/`GITHUB_OWNER`/`GITHUB_REPO` in all environments. |
| `src/app/upload/page.tsx` | Server RSC — page metadata (title, OG, Twitter cards) via `getSiteUrl()` |
| `src/app/upload/upload-page.tsx` | Client component (~700 lines) — drag-and-drop file zone with preview and size-based tier indicator, metadata form (title, description, type dropdown, filetype, tags, optional ENS), wallet connection (injected MetaMask + WalletConnect QR modal), paid upload notice with external uploader links (ArDrive, ar.io Turbo, Akord) + "Switch to Paste ID" for files >100KB, funding progress callback with phase display ("Sending payment…", "Waiting for payment to confirm…"), stranded funding tx banner with "Resume" button, success page with turbo-gateway image link + site link, error handling, "Paste Arweave ID" fallback tab |
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
| `scripts/review-pending.py` | Moderation assistant: fetches pending items, downloads Arweave assets, checks magic bytes, commits approve/reject via Git Data API. Used by the Hermes Agent daily cron job. |

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

### Key Modified Files (v2.3.0)

| File | Changes |
|------|---------|
| `src/lib/gateway-url.ts` | Replaced `permaweb.io` with `turbo-gateway.com` in `ARWEAVE_GATEWAYS`. `turbo-gateway.com` serves freshly-uploaded Turbo data items instantly (before bundle confirmation on Arweave mainnet). `permaweb.io` was removed because it returns 200 OK with an HTML 404 stub, which prevents `<img>` `onError` from firing in the `GatewayImage` fallback chain. |
| `src/lib/upload/turbo-upload.ts` | Added `pollForFundConfirmation()` — polls `turbo.submitFundTransaction()` every 3s (120s timeout) to wait for on-chain funding confirmation. `uploadPaid()` catches the funding race error (`Failed to submit fund transaction`), extracts the tx ID, persists to localStorage, polls for confirmation, then retries `uploadFile` without `OnDemandFunding` (balance already credited — no double-charge). Added `resumeFunding()` for manual recovery. Added `UploadProgress` type + callback for phase-based UI feedback. Added `getStrandedFundingTx()` / `clearStrandedTx()` localStorage helpers (24h expiry). |
| `src/app/upload/upload-page.tsx` | Paid uploads (>100KB) now show an amber notice with links to external Arweave uploaders (ArDrive, ar.io Turbo, Akord) and a "Switch to Paste ID" button that preserves the metadata form. Submit button only renders for free files or paste mode (was incorrectly showing for large files). Stranded funding tx banner with "Resume" and "Dismiss" buttons. Progress callback wiring for funding/confirming phases. Success page: "View image" links to `turbo-gateway.com` (instant), "may take a few hours" replaces "~60s". |

### Deleted Files/Directories

**Original refactor (~20):** `src/app/dashboard/`, `draft/`, `companion/`, `submit/`, `log/`, `loading-test/`, `rive-test/`; dead API routes (`api/data`, `notion`, `random`, `embedding`, `fc`, `bundlr`); `src/pages/api/auth/siwe/`; `src/lib/notion/`, `siwe/`, `redis.ts`, `constant.ts`, `types/`; `src/middleware.ts`; `src/components/dashboard/`, `fc/`, `web3/`; `data/comments.tsx`, `page-views.tsx`; `src/hooks/`.

**Cleanup pass:** `src/app/api/page.tsx` + `api/endpoint.ts` (stale `/api` docs), `src/lib/image-loader.ts`, `src/data/unmapped-assets.json`, `src/components/data/copy.tsx`, `data/image-dl.tsx`, `data/sentiment.tsx`, `ui/loading-text.tsx`, `ui/badge.tsx`, `ui/tooltip.tsx`, `ui/accordion.tsx`, `public/vercel.svg`, `public/next.svg`, `public/loading.riv`, `src/app/robots.txt` (→ `robots.ts`), `bun.lockb`, `src/app/contribute/` (contribute page removed; all `/contribute` links across the front page, info page, footer, and leaderboard now point to `/upload`, and `"contribute"` was dropped from `staticPages` in `src/lib/constants.ts`).

### Key Modified Files (v2.4.0)

| File | Changes |
|------|---------|
| `src/lib/metadata.ts` | Added `isPubliclyVisible()`, `filterPubliclyVisible()`, `getPendingItems()` helper functions for moderation filtering |
| `src/app/api/submit/route.ts` | New uploads now set `SubmissionStatus: "submitted"` (was previously unset, meaning items went live immediately) |
| `src/app/page.tsx` | Gallery data now uses `filterPubliclyVisible()` instead of `item.Status === "published"` |
| `src/app/fav/page.tsx` | Favorites data now uses `filterPubliclyVisible()` |
| `src/app/random/page.tsx` | Random picker now uses `filterPubliclyVisible()` |
| `src/app/leaderboard/page.tsx` | Leaderboard now uses `filterPubliclyVisible()` |
| `src/app/sitemap.tsx` | Sitemap now uses `filterPubliclyVisible()` |
| `src/app/[slug]/page.tsx` | Added amber "Pending review" badge when `SubmissionStatus === "submitted"` |
| `scripts/review-pending.py` | New — moderation assistant script (see [Content Moderation Pipeline](#content-moderation-pipeline)) |
| `package.json` | Version bumped to `2.4.0` |

### Key New Files (v2.5.0)

| File | Purpose |
|------|---------|
| `src/lib/upload/chain-utils.ts` | Chain detection (`isOnBaseChain`, `switchToBaseChain`), USDC balance check via ERC-20 contract call, ETH gas check, `watchChainChanges` for injected wallet chain-switch events |

### Key Modified Files (v2.5.0)

| File | Changes |
|------|---------|
| `src/app/upload/upload-page.tsx` | **Paid uploads re-enabled.** Replaced the "temporarily unavailable" notice with a full upload flow: wallet connect, chain detection (Base 8453), auto-switch prompt ("Switch to Base" button when on wrong chain), USDC + ETH balance checks, cost estimate display, and conditional submit button (only when wallet is connected, on Base, and has sufficient USDC/ETH). Added 3 new `useState` vars (`chainId`, `checkingChain`, `balances`), a chain-watch effect, a balance-check effect, and a `handleChainSwitch` handler. |
| `package.json` | Version bumped to `2.5.0` |

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

## Content Moderation Pipeline (v2.4.0)

Added in v2.4.0 to gate new user uploads behind a review step before they appear in public galleries. Uses a **zero-OpEx** approach: the Hermes Agent on the VPS runs a daily cron job that analyzes each pending asset and commits approve/reject decisions back to GitHub.

### How it works

```
┌─────────────────────────────────────────────┐
│             USER UPLOAD FLOW                 │
│  1. User submits file + metadata via /upload │
│  2. POST /api/submit creates Item with:      │
│     SubmissionStatus: "submitted"            │
│     Status: "published"                      │
│  3. Item is HIDDEN from:                     │
│     - Galleries (/, /fav, /random)           │
│     - Search results                         │
│     - Sitemap, Leaderboard                   │
│  4. Item is VISIBLE only at direct URL       │
│     /[slug] with amber badge:                │
│     "Pending review"                         │
└──────────────────────┬──────────────────────┘
                       │
┌──────────────────────▼──────────────────────┐
│       HERMES AGENT CRON (VPS, daily)         │
│                                              │
│  1. Fetch metadata.json from GitHub          │
│  2. Find items with SubmissionStatus:        │
│     "submitted"                              │
│  3. For each item:                           │
│     a. Download thumbnail from Arweave       │
│     b. Check magic bytes against filetype    │
│     c. Vision analysis (NSFW/spam check)     │
│     d. Decide: approve or reject             │
│  4. Commit updates via GitHub API            │
│  5. Vercel redeploys automatically           │
└─────────────────────────────────────────────┘
```

### Filter Logic

Items are publicly visible in galleries, search, sitemaps, and leaderboards when:

```
Status === "published" AND (SubmissionStatus is undefined OR SubmissionStatus === "approved")
```

- **Legacy items** (1,916+ entries from before v2.4.0): no `SubmissionStatus` field → visible by default
- **New submissions**: `SubmissionStatus: "submitted"` → hidden from galleries, visible at direct URL
- **Approved items**: `SubmissionStatus: "approved"` → visible everywhere
- **Rejected items**: `SubmissionStatus: "rejected"` → hidden everywhere

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/metadata.ts` | `isPubliclyVisible()`, `filterPubliclyVisible()`, `getPendingItems()` helpers |
| `src/app/api/submit/route.ts` | Sets `SubmissionStatus: "submitted"` on new items (line 210) |
| `src/app/page.tsx` | Uses `filterPubliclyVisible()` for gallery data |
| `src/app/fav/page.tsx` | Uses `filterPubliclyVisible()` for favorites |
| `src/app/random/page.tsx` | Uses `filterPubliclyVisible()` for random picker |
| `src/app/leaderboard/page.tsx` | Uses `filterPubliclyVisible()` for leaderboard |
| `src/app/sitemap.tsx` | Uses `filterPubliclyVisible()` for sitemap entries |
| `src/app/[slug]/page.tsx` | Shows amber "Pending review" badge when `SubmissionStatus === "submitted"` |
| `scripts/review-pending.py` | Moderation assistant script (see below) |

### Moderation Assistant Script (`scripts/review-pending.py`)

A Python CLI tool that handles the data plumbing for the Hermes cron job:

```bash
# Dry-run: show pending items with download + magic byte check
python3 scripts/review-pending.py

# Report only (no downloads, just list)
python3 scripts/review-pending.py --report-only

# Approve specific items (dry-run, no commit)
python3 scripts/review-pending.py --approve --id <item_id_1> <item_id_2>

# Approve and commit to GitHub (requires GITHUB_TOKEN)
python3 scripts/review-pending.py --approve --id <item_id> --commit

# Reject and commit
python3 scripts/review-pending.py --reject --id <item_id> --commit
```

**What it does:**
1. Fetches `metadata.json` from `raw.githubusercontent.com`
2. Finds items with `SubmissionStatus: "submitted"`
3. Downloads each asset's thumbnail from Arweave to a temp dir
4. Checks magic bytes match the declared filetype (PNG → `\x89PNG`, JPG → `\xff\xd8\xff`, etc.)
5. Outputs a structured report for the agent to review
6. With `--commit`: uses the Git Data API to write decisions back to GitHub

**Env vars required for commit operations:**
- `GITHUB_TOKEN` — PAT with repo contents write scope
- `GITHUB_OWNER` — defaults to `BeanInTheMachine`
- `GITHUB_REPO` — defaults to `cc0-lib`

### Hermes Cron Job Setup (VPS)

The cron job runs on the **VPS Hermes Agent** (not locally). Set it up once and it runs daily, notifying you of pending uploads via Signal. You review the images on your phone and reply to approve/reject — Hermes handles the CLI moderation commands for you.

#### One-time setup

**1. Ensure the script is accessible on the VPS**

The script lives in the repo at `scripts/review-pending.py`. Clone the repo:

```bash
cd ~ && git clone https://github.com/BeanInTheMachine/cc0-lib.git
```

**2. Create or verify a GitHub PAT with repo scope**

The cron job and manual moderation both need a token to commit decisions. Add to Hermes `.env`:

```
GITHUB_TOKEN=github_pat_...
GITHUB_OWNER=BeanInTheMachine
GITHUB_REPO=cc0-lib
```

Generate at https://github.com/settings/tokens (needs `repo` scope, fine-grained with `Contents: read+write` for `BeanInTheMachine/cc0-lib` only).

**3. Set up the Hermes cron job**

Created via the Hermes cronjob tool with the following config:

| Field | Value |
|-------|-------|
| **Name** | `cc0-lib daily moderation` |
| **Schedule** | `0 2 * * *` (02:00 UTC / 04:00 CEST — off-peak) |
| **Skills** | `terminal` |
| **Workdir** | `/home/cc0/cc0-lib` |
| **Deliver** | `signal:+15752991281` |

**Cron prompt:** fetches `metadata.json` from GitHub raw, finds items with `SubmissionStatus: "submitted"`, and reports each one (title, type, filetype, ENS, Arweave URL, tags, description) via Signal. If none pending, reports "All clear!".

#### What the cron job does each run

1. Fetches `metadata.json` from GitHub raw
2. Identifies pending items (`SubmissionStatus: "submitted"`)
3. Reports each item (title, type, Arweave URL, ENS, tags) via Signal
4. Includes instructions for the user to reply to approve/reject

#### Manual review flow (from phone)

1. **4 AM** — cron sends pending-items report to your phone via Signal
2. **Tap the Arweave links** right in Signal to preview each image
3. **Reply directly to the message** — e.g. "approve first one, reject the weird Noun"
4. **Hermes runs** the appropriate CLI commands and confirms back

No SSH, no app switching — all from the Signal thread.

#### Moderation commands (Hermes runs these)

```bash
# List pending
cd ~/cc0-lib && python3 scripts/review-pending.py --report-only

# Approve one or more
python3 scripts/review-pending.py --approve --id <id> --commit

# Reject one or more
python3 scripts/review-pending.py --reject --id <id> --commit
```

#### Future: automated vision moderation

The current workflow is manual (user reviews on phone, replies to approve/reject). In the future, a vision-capable model (e.g. via OpenRouter) can be swapped in to auto-approve safe content. When that's wired up:

- Set a per-cron model override to a vision model (e.g. `meta-llama/llama-3.2-11b-vision-instruct` via OpenRouter)
- Update the cron prompt to include vision analysis and auto-commit decisions
- Cost: ~$0.05/100 images — fractions of a cent per daily run

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Legacy items** (no `SubmissionStatus`) | Visible by default (passes the filter) |
| **New upload, not yet reviewed** | Hidden from galleries, visible at `/slug` with amber badge |
| **New upload, approved** | Visible everywhere (cron job sets `SubmissionStatus: "approved"`) |
| **New upload, rejected** | Hidden everywhere (cron job sets `SubmissionStatus: "rejected"`) |
| **Direct URL of rejected item** | Returns 404 via `notFound()` in `/[slug]/page.tsx` — the `getItemBySlug()` lookup succeeds but the page renders as 404. Currently this is a soft 404 (HTTP 200, see Known Limitations #8). |
| **Race: user submits while cron is running** | Retry logic in submit API handles conflicts; cron picks up missed items next day |
| **Empty gallery (no approved items yet)** | Shows "0 results" message — normal for a freshly deployed site with no reviewed uploads |

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
12. **Turbo-to-Arweave propagation delay.** Turbo uploads are data items served instantly via `turbo-gateway.com` but take hours to propagate to standard Arweave gateways (`arweave.net`) because Turbo batches data items into on-chain transactions periodically. The success page links to `turbo-gateway.com` (instant) and warns "may take a few hours to appear" on the site. `GatewayImage` uses `turbo-gateway.com` as a fallback so images load during the propagation window.
13. **Webpack-only build.** Next.js 16 defaults to Turbopack, but the `node:` scheme polyfills required by the Turbo SDK only work with webpack. `dev` and `build` scripts use `--webpack`. No runtime performance difference — output JS/CSS is identical.

14. **Paid uploads (>100KB) — RESOLVED in v2.5.0.** Paid uploads re-enabled with chain detection (`isOnBaseChain`), Base chain auto-switch, USDC balance check (ERC-20 contract call via ethers), and ETH gas check. The funding race retry/poll mechanism (`pollForFundConfirmation` + `resumeFunding`) handles the race between on-chain USDC tx confirmation and Turbo's credit call. The submit button is only enabled when the wallet is on Base (8453) with sufficient USDC + ETH. See [Upload Page](#upload-page) for the full flow.
15. **Fresh-upload gateway propagation — RESOLVED in v2.3.0.** `turbo-gateway.com` added to `ARWEAVE_GATEWAYS` (serves Turbo data items instantly, before bundle confirmation on Arweave mainnet). `permaweb.io` removed (was returning 200 OK with an HTML 404 stub, which blocked `<img>` `onError` from triggering and caused broken images instead of the fallback card). New uploads now load in the gallery immediately via `turbo-gateway.com` while standard Arweave gateways index the bundle transaction.

## Dependency Summary

**Before v2.2.0:** 27 total — 22 runtime + 5 dev.
**After v2.2.0:** 34 total — 29 runtime (`@ardrive/turbo-sdk`, `@walletconnect/ethereum-provider`, `ethers`, `crypto-browserify`, `stream-browserify`, `buffer`, `process` added) + 5 dev. Standardized on **npm**.

## Open Issues / Next Session

1. **Vercel domain redirect direction.** The apex `cc0-lib.xyz` should be the primary domain with `www` redirecting to it. Currently reversed — `www` is primary and the apex `308`-redirects. This affects Farcaster Mini App embeds (clients treat apex and www as different apps) and OG image scrapers that don't follow redirects.
2. **Stranded payment recovery** `0x7132978a183efa24b79d8d9e70fa0736b2fd55a28b3794a28e30d24ef93d0c9e` via `turbo.submitFundTransaction({ txId })` (same wallet, `token: 'base-usdc'`).
3. **Paid uploads (>100KB) — RESOLVED in v2.5.0.** Chain detection, Base switch, USDC/ETH balance checks all implemented. See [Known Limitations #14](#14-paid-uploads-100kb-resolved-in-v250) for details.
4. **WalletConnect for all uploads.** Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in Vercel for users without an injected wallet.
5. **README.md.** Still the default Next.js boilerplate — should be updated.
6. **Soft 404s.** Unmatched routes (including rejected items' direct URLs) return HTTP 200 instead of 404. Revisitable if Next.js adds a proper not-found status workaround.

## Last Verified

- `tsc --noEmit`: 0 errors · `eslint`: 0 errors (pre-existing `<img>`/exhaustive-deps warnings only)
- `npm run build` (production): 0 errors, all routes generated
- **Moderation pipeline:** Code reviewed and committed (`597d462`). Filter logic verified by TypeScript compilation — all 8 modified files compile clean. Pending items correctly hidden from galleries/search/sitemaps. Badge renders on detail pages. Legacy items (no `SubmissionStatus`) remain visible.
- **Moderation assistant script:** Tested locally — `python3 scripts/review-pending.py --report-only` returns "No items pending review. All clear!" (expected, as no new submissions have been made since the pipeline was deployed).
- **Free upload (≤100KB): VERIFIED end-to-end on production** (pre-moderation). Wallet-signed `uploadFile` → Arweave mainnet → `POST /api/submit` → committed to `metadata.json`. 20+ real uploads confirmed. Now also sets `SubmissionStatus: "submitted"` so they await review.
- **Git Data API submit: VERIFIED in production** — 20+ real submit commits appended to the >1MB `metadata.json`.
- **Paid upload (>100KB): RE-ENABLED.** Chain detection (`isOnBaseChain`, `switchToBaseChain`), USDC balance check, and ETH gas check implemented in `chain-utils.ts`. Upload page shows wallet connect → chain switch → balance check → submit flow for files >100KB. Funding race recovery via `pollForFundConfirmation` + `resumeFunding`. Build check deferred to Vercel deploy (deps not installed locally).
- **Farcaster Mini App:** manifest live + verified.
- **Gateway delivery:** `turbo-gateway.com` → `arweave.net` → `ar-io.net` fallback chain.
- **Latest push:** `BeanInTheMachine/cc0-lib` `main` @ `597d462`.
- **Catalog:** **1,936+ items** — 1,916 legacy + 20+ live user uploads.
