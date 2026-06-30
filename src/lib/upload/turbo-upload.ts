import { TurboFactory, OnDemandFunding } from "@ardrive/turbo-sdk/web";
import type {
  TurboUploadDataItemResponse,
  EthereumWalletAdapter,
  TurboAuthenticatedClient,
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
  turbo: TurboAuthenticatedClient,
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

  onProgress?.({ phase: "funding", message: "Sending payment..." });

  try {
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

export async function estimateCost(fileSize: number): Promise<{
  usdc: string;
  usd: string;
  winc: string;
}> {
  const turbo = TurboFactory.unauthenticated({ token: "base-usdc" });

  const [tokenPrice, fiatEstimate] = await Promise.all([
    turbo.getTokenPriceForBytes({ byteCount: fileSize }),
    turbo.getFiatEstimateForBytes({
      byteCount: fileSize,
      currency: "usd",
    }),
  ]);

  return {
    usdc: formatTokenAmount(tokenPrice.tokenPrice, 6),
    usd: fiatEstimate.amount.toFixed(2),
    winc: fiatEstimate.winc,
  };
}

function formatTokenAmount(value: string, decimals: number): string {
  const num = parseFloat(value) / Math.pow(10, decimals);
  if (num < 0.01) return "<$0.01";
  return `$${num.toFixed(2)}`;
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
