import { TurboFactory, X402Funding } from "@ardrive/turbo-sdk/web";
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
  turbo: import("@ardrive/turbo-sdk").TurboAuthenticatedClient,
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
 * Estimate the cost of uploading a file.
 *
 * NOTE: The Turbo payment API's /price/base-usdc endpoint returns 400, so we
 * cannot use getTokenPriceForBytes(). Instead we use getFiatEstimateForBytes()
 * which hits /price/bytes/{size} and /rates — both work fine. Since USDC is
 * a stablecoin at ~1:1 with USD, we treat the USD estimate as the USDC amount.
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
 * Upload a paid file (>100KB) to Arweave via the Turbo SDK.
 *
 * Uses X402Funding — the intended payment mechanism for `base-usdc`. The Turbo
 * SDK lists `base-usdc` as x402-enabled (see x402EnabledTokens in upload.ts).
 * X402 sends micro USDC payments atomically with the upload via the HTTP 402
 * Payment Required protocol, avoiding the broken /price/base-usdc endpoint
 * that OnDemandFunding depends on.
 */
export async function uploadPaid(
  file: File,
  metadata: UploadMetadata,
  walletAdapter: EthereumWalletAdapter,
  onProgress?: UploadProgressCallback
): Promise<TurboUploadDataItemResponse> {
  const turbo = TurboFactory.authenticated({
    walletAdapter,
    token: "base-usdc",
  });

  onProgress?.({ phase: "funding", message: "Signing and paying with USDC..." });

  try {
    return await turbo.uploadFile({
      fileStreamFactory: () => file.stream(),
      fileSizeFactory: () => file.size,
      dataItemOpts: { tags: buildTags(file, metadata) },
      fundingMode: new X402Funding({}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    const match = msg.match(FUNDING_RACE_PATTERN);
    if (!match?.[1]) throw err;

    // Stranded funding tx from a previous OnDemandFunding attempt
    const txId = match[1];
    persistStrandedTx(txId);

    const confirmed = await pollForFundConfirmation(turbo, txId, onProgress);
    if (!confirmed) {
      throw new Error(
        `Payment sent but confirmation timed out. Your USDC was sent (tx ${txId}). The funds are recoverable — refresh the page and click "Resume" to retry, or manually call turbo.submitFundTransaction({ txId: "${txId}" }) once the tx confirms on Base.`
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
