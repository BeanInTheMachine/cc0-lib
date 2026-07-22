import { TurboFactory } from "@ardrive/turbo-sdk/web";
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
 * Turbo's API does NOT support `base-usdc` at all. For `base-eth`,
 * OnDemandFunding relies on the SDK's internal funding pipeline which
 * has timing issues with transaction confirmation + submitFundTransaction.
 *
 * Instead we do a fully manual flow:
 * 1. Calculate WINC cost from /price/bytes (works)
 * 2. Convert WINC to approximate ETH using /rates (works)
 * 3. Get Turbo's base-eth wallet address from /info (works)
 * 4. Send ETH directly to that address via ethers (user approves in MetaMask)
 * 5. Poll submitFundTransaction until Turbo credits the balance
 * 6. Upload with ExistingBalanceFunding
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

  // Step 1: Check existing Turbo balance
  onProgress?.({ phase: "funding", message: "Checking Turbo credit balance..." });
  const balance = await turbo.getBalance();
  const wincCost = await getWincCost(file.size);

  // If sufficient balance exists, upload directly
  if (BigInt(balance.effectiveBalance) >= BigInt(wincCost)) {
    onProgress?.({ phase: "uploading", message: "Uploading to Arweave..." });
    return turbo.uploadFile({
      fileStreamFactory: () => file.stream(),
      fileSizeFactory: () => file.size,
      dataItemOpts: { tags: buildTags(file, metadata) },
    });
  }

  // Step 2: Calculate how much ETH to send (with 10% buffer)
  const topUpWinc = BigInt(
    Math.ceil(Number(wincCost) * 1.1 - Number(balance.effectiveBalance))
  );
  const ethAmount = await wincToETH(topUpWinc);

  onProgress?.({
    phase: "funding",
    message: `Sending ~${ethAmount} ETH to fund upload...`,
  });

  // Step 3: Get Turbo's base-eth wallet address
  const wallets = await turbo.getTurboCryptoWallets();
  const turboAddress = wallets["base-eth"];
  if (!turboAddress) {
    throw new Error(
      "Could not find Turbo wallet address. Please try again later or upload via ArDrive (https://app.ardrive.io)."
    );
  }

  // Step 4: Send ETH directly to Turbo's wallet via ethers
  const signer = await walletAdapter.getSigner();
  const { ethers } = await import("ethers");
  const tx = await signer.sendTransaction({
    to: turboAddress,
    value: ethers.parseEther(ethAmount),
  });
  const txId = tx.hash;

  onProgress?.({ phase: "confirming", message: "Waiting for payment to confirm on Base..." });

  // Step 5: Poll submitFundTransaction until Turbo credits the balance
  persistStrandedTx(txId);
  const start = Date.now();
  let confirmed = false;
  while (Date.now() - start < FUND_POLL_TIMEOUT) {
    try {
      const result = await turbo.submitFundTransaction({ txId });
      if (result.status === "confirmed") {
        confirmed = true;
        break;
      }
      if (result.status === "failed") {
        break;
      }
    } catch {
      // network error / API not ready — keep polling
    }
    await new Promise((r) => setTimeout(r, FUND_POLL_INTERVAL));
  }

  if (!confirmed) {
    throw new Error(
      `Payment sent but Turbo has not credited the balance yet. Your ETH was sent (tx ${txId}). Refresh the page and click "Resume" to retry, or try again later — the funds are not lost.`
    );
  }

  clearStrandedTx();

  // Step 6: Upload with existing balance
  onProgress?.({ phase: "uploading", message: "Uploading to Arweave..." });
  return turbo.uploadFile({
    fileStreamFactory: () => file.stream(),
    fileSizeFactory: () => file.size,
    dataItemOpts: { tags: buildTags(file, metadata) },
  });
}

export function isFreeUpload(file: File): boolean {
  return file.size <= FREE_UPLOAD_LIMIT;
}

/**
 * Get the WINC cost for a given byte count (uses the working /price/bytes endpoint).
 */
async function getWincCost(byteCount: number): Promise<string> {
  const turbo = TurboFactory.unauthenticated({ token: "base-eth" });
  const costs = await turbo.getUploadCosts({ bytes: [byteCount] });
  return costs[0].winc;
}

/**
 * Convert a WINC amount to an ETH amount string using the /price/base-eth endpoint.
 */
async function wincToETH(winc: bigint): Promise<string> {
  const turbo = TurboFactory.unauthenticated({ token: "base-eth" });

  // Get the WINC cost for 1 ETH (= 1 base-eth token amount in wei = 10^18)
  const oneEthWinc = await turbo.getWincForToken({
    tokenAmount: "1000000000000000000",
  });

  // Get the WINC cost for the given bytes
  const ethAmount =
    Number(winc) / Number(oneEthWinc.winc);
  // Round up to avoid underpayment (6 significant digits for small amounts)
  return (Math.ceil(ethAmount * 1_000_000) / 1_000_000).toFixed(6);
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
