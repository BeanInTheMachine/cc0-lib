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
 * Since the Turbo payment API doesn't support /price/base-usdc (returns 400),
 * we cannot use OnDemandFunding or X402Funding (both rely on that endpoint
 * internally or on x402-fetch which has signing-compatibility issues).
 *
 * Instead we manually:
 * 1. Calculate the USDC cost from fiat pricing (working endpoints)
 * 2. Check the user's existing Turbo balance
 * 3. If insufficient, send USDC directly to Turbo's Base wallet via ethers
 * 4. Submit the tx to Turbo to credit the balance
 * 5. Upload using ExistingBalanceFunding (the default)
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

  // Step 1: Check existing Turbo balance
  onProgress?.({ phase: "funding", message: "Checking Turbo credit balance..." });
  const balance = await turbo.getBalance();
  const fileSizeWinc = await getWincCost(file.size);

  // If sufficient balance exists, upload directly
  if (BigInt(balance.effectiveBalance) >= BigInt(fileSizeWinc)) {
    onProgress?.({ phase: "uploading", message: "Uploading to Arweave..." });
    return turbo.uploadFile({
      fileStreamFactory: () => file.stream(),
      fileSizeFactory: () => file.size,
      dataItemOpts: { tags: buildTags(file, metadata) },
    });
  }

  // Step 2: Calculate how much USDC to send (with 10% buffer)
  const topUpWinc = BigInt(
    Math.ceil(Number(fileSizeWinc) * 1.1 - Number(balance.effectiveBalance))
  );
  const usdcAmount = await wincToUSD(topUpWinc);

  onProgress?.({
    phase: "funding",
    message: `Sending ~$${usdcAmount} USDC to fund upload...`,
  });

  // Step 3: Get Turbo's Base USDC wallet address
  const wallets = await turbo.getTurboCryptoWallets();
  const turboAddress = wallets["base-usdc"];
  if (!turboAddress) {
    throw new Error("Could not find Turbo Base USDC wallet address");
  }

  // Step 4: Send USDC to Turbo's wallet via ethers
  const signer = await walletAdapter.getSigner();
  const { ethers } = await import("ethers");

  const usdcContract = new ethers.Contract(
    USDC_CONTRACT_BASE,
    ["function transfer(address to, uint256 amount) returns (bool)"],
    signer
  );

  const usdcAmountWei = ethers.parseUnits(usdcAmount, 6);
  const tx = await usdcContract.transfer(turboAddress, usdcAmountWei);
  const txId = tx.hash;

  onProgress?.({ phase: "confirming", message: "Waiting for payment to confirm on Base..." });

  // Step 5: Submit the transaction to Turbo to credit the balance
  persistStrandedTx(txId);
  const confirmed = await pollForFundConfirmation(turbo, txId, onProgress);
  if (!confirmed) {
    throw new Error(
      `Payment sent but confirmation timed out. Your USDC was sent (tx ${txId}). The funds are recoverable — refresh the page and click "Resume" to retry.`
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
