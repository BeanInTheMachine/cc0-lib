import { TurboFactory, OnDemandFunding } from "@ardrive/turbo-sdk/web";
import type {
  TurboUploadDataItemResponse,
  EthereumWalletAdapter,
} from "@ardrive/turbo-sdk";
export interface UploadMetadata {
  title: string;
  description: string;
  type: string;
  filetype: string;
  tags: string[];
  ens?: string;
}

export type UploadPhase = "signing" | "funding" | "confirming" | "uploading";

export interface UploadProgress {
  phase: UploadPhase;
  message?: string;
}

export type UploadProgressCallback = (progress: UploadProgress) => void;

export interface StrandedFundingTx {
  txId: string;
  timestamp: number;
}

const FREE_UPLOAD_LIMIT = 100 * 1024;
const FUNDING_RACE_PATTERN = /Failed to submit fund transaction.*'turbo\.submitFundTransaction\(id\)':\s*(\S+)/;
const FUND_POLL_INTERVAL = 3000;
const FUND_POLL_TIMEOUT = 120_000;
const STRANDED_TX_KEY = "cc0-lib-stranded-funding-tx";

// USDC contract address on Base
const USDC_CONTRACT_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

function buildTags(file: File, metadata: UploadMetadata) {
  return [
    { name: "App-Name", value: "cc0-lib" },
    { name: "Content-Type", value: file.type || "application/octet-stream" },
    { name: "Title", value: metadata.title },
    { name: "Type", value: metadata.type },
    { name: "Filetype", value: metadata.filetype },
    { name: "Tags", value: metadata.tags.join(",") },
    { name: "ENS", value: metadata.ens ?? "" },
    { name: "Description", value: metadata.description },
  ];
}

export async function uploadFree(
  file: File,
  metadata: UploadMetadata,
  walletAdapter: EthereumWalletAdapter
): Promise<TurboUploadDataItemResponse> {
  const turbo = TurboFactory.authenticated({
    walletAdapter,
    token: "base-usdc",
  });

  return turbo.uploadFile({
    fileStreamFactory: () => file.stream(),
    fileSizeFactory: () => file.size,
    dataItemOpts: {
      tags: buildTags(file, metadata),
    },
  });
}

async function pollForFundConfirmation(
  turbo: ReturnType<typeof TurboFactory.authenticated>,
  txId: string,
  onProgress?: UploadProgressCallback
): Promise<boolean> {
  const start = Date.now();
  onProgress?.({ phase: "confirming", message: "Waiting for payment to confirm on Base..." });

  while (Date.now() - start < FUND_POLL_TIMEOUT) {
    try {
      const result = await turbo.submitFundTransaction({ txId });
      if (result.status === "confirmed") {
        return true;
      }
      if (result.status === "failed") {
        return false;
      }
    } catch {
      // network error — keep polling
    }
    await new Promise((r) => setTimeout(r, FUND_POLL_INTERVAL));
  }
  return false;
}

/**
 * Estimate cost using fiat pricing (the /price/base-usdc endpoint is broken).
 * USDC ≈ USD (stablecoin), so we use fiat estimate directly.
 */
export async function estimateCost(fileSize: number): Promise<{
  usdc: string;
  usd: string;
  winc: string;
}> {
  const turbo = TurboFactory.unauthenticated({ token: "base-usdc" });

  const fiatEstimate = await turbo.getFiatEstimateForBytes({
    byteCount: fileSize,
    currency: "usd",
  });

  return {
    usdc: `$${fiatEstimate.amount.toFixed(2)}`,
    usd: `$${fiatEstimate.amount.toFixed(2)}`,
    winc: fiatEstimate.winc,
  };
}

/**
 * Upload a paid file (>100KB) to Arweave.
 *
 * NOTE: Turbo's API does NOT support the `base-usdc` token — all endpoints
 * (price, balance, info) return errors for it. The only supported token
 * on Base is `base-eth`, which the user pays with for both gas and upload.
 *
 * We use OnDemandFunding with `base-eth`, which the SDK fully supports:
 * - /price/base-eth works
 * - /account/balance/base-eth works
 * - /info returns a base-eth wallet address
 * - Enabled for on-demand funding
 */
export async function uploadPaid(
  file: File,
  metadata: UploadMetadata,
  walletAdapter: EthereumWalletAdapter,
  onProgress?: UploadProgressCallback
): Promise<TurboUploadDataItemResponse> {
  const turbo = TurboFactory.authenticated({
    walletAdapter,
    token: "base-eth",
  });

  onProgress?.({ phase: "funding", message: "Sending payment with ETH on Base..." });

  try {
    // OnDemandFunding calculates cost, asks user to pay, credits Turbo, uploads
    return await turbo.uploadFile({
      fileStreamFactory: () => file.stream(),
      fileSizeFactory: () => file.size,
      dataItemOpts: { tags: buildTags(file, metadata) },
      fundingMode: new OnDemandFunding({ topUpBufferMultiplier: 1.1 }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    const match = msg.match(FUNDING_RACE_PATTERN);
    if (!match?.[1]) throw err;

    const txId = match[1];
    persistStrandedTx(txId);

    const confirmed = await pollForFundConfirmation(turbo, txId, onProgress);
    if (!confirmed) {
      throw new Error(
        `Payment sent but confirmation timed out. Your ETH was sent (tx ${txId}). The funds are recoverable — refresh the page and click "Resume" to retry.`
      );
    }

    clearStrandedTx();
    onProgress?.({ phase: "uploading", message: "Uploading to Arweave..." });

    return turbo.uploadFile({
      fileStreamFactory: () => file.stream(),
      fileSizeFactory: () => file.size,
      dataItemOpts: { tags: buildTags(file, metadata) },
    });
  }
}

export function isFreeUpload(file: File): boolean {
  return file.size <= FREE_UPLOAD_LIMIT;
}

/**
 * Get the WINC cost for a given byte count (uses the working /price/bytes endpoint).
 */
async function getWincCost(byteCount: number): Promise<string> {
  const turbo = TurboFactory.unauthenticated({ token: "base-usdc" });
  const costs = await turbo.getUploadCosts({ bytes: [byteCount] });
  return costs[0].winc;
}

/**
 * Convert a WINC amount to a USD amount string using Turbo's fiat rates.
 */
async function wincToUSD(winc: bigint): Promise<string> {
  const turbo = TurboFactory.unauthenticated({ token: "base-usdc" });
  const rates = await turbo.getFiatRates();
  const wincPerOneGiB = BigInt(rates.winc);
  const usdPerOneGiB = rates.fiat.usd;

  const usdAmount =
    (Number(winc) / Number(wincPerOneGiB)) * usdPerOneGiB;
  return Math.ceil(usdAmount * 100) / 100 + ""; // round up to cents
}

function persistStrandedTx(txId: string) {
  try {
    localStorage.setItem(
      STRANDED_TX_KEY,
      JSON.stringify({ txId, timestamp: Date.now() })
    );
  } catch {}
}

export function clearStrandedTx() {
  try {
    localStorage.removeItem(STRANDED_TX_KEY);
  } catch {}
}

export async function resumeFunding(
  txId: string,
  walletAdapter: EthereumWalletAdapter
): Promise<{ status: "confirmed" | "pending" | "failed" }> {
  const turbo = TurboFactory.authenticated({
    walletAdapter,
    token: "base-usdc",
  });
  const result = await turbo.submitFundTransaction({ txId });
  return { status: result.status };
}

export function getStrandedFundingTx(): StrandedFundingTx | null {
  try {
    const raw = localStorage.getItem(STRANDED_TX_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.timestamp > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(STRANDED_TX_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export { FREE_UPLOAD_LIMIT };
