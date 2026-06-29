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

const FREE_UPLOAD_LIMIT = 100 * 1024;

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

export async function uploadPaid(
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
    fundingMode: new OnDemandFunding({
      topUpBufferMultiplier: 1.1,
    }),
  });
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

export { FREE_UPLOAD_LIMIT };
