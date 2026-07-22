import type { BrowserProvider, Signer } from "ethers";

export const BASE_CHAIN_ID = 8453;
export const BASE_CHAIN_ID_HEX = "0x2105"; // 8453 in hex

export const USDC_CONTRACT_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Minimal ERC-20 ABI for balanceOf + decimals
const USDC_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

export interface WalletBalances {
  usdc: bigint;
  usdcFormatted: string;
  eth: bigint;
  ethFormatted: string;
  hasSufficientUsdc: boolean;
  hasSufficientEth: boolean;
  estimatedCostUsdc: string;
}

/**
 * Get the current chain ID from the wallet provider.
 * Throws if provider is not available.
 */
export async function getCurrentChainId(
  provider: BrowserProvider
): Promise<number> {
  const network = await provider.getNetwork();
  return Number(network.chainId);
}

/**
 * Check if the wallet is connected to Base (chain 8453).
 */
export async function isOnBaseChain(
  provider: BrowserProvider
): Promise<boolean> {
  const chainId = await getCurrentChainId(provider);
  return chainId === BASE_CHAIN_ID;
}

/**
 * Prompt MetaMask (or compatible injected wallet) to switch to Base chain.
 * If Base is not in the wallet's network list, it adds it.
 */
export async function switchToBaseChain(): Promise<void> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No injected wallet found to switch chain.");
  }
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_CHAIN_ID_HEX }],
    });
  } catch (switchError: any) {
    // 4902 = chain not added yet
    if (switchError.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: BASE_CHAIN_ID_HEX,
            chainName: "Base",
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://mainnet.base.org"],
            blockExplorerUrls: ["https://basescan.org"],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}

/**
 * Get USDC and ETH balances for an address on Base.
 * Returns formatted strings and sufficiency checks against an estimated cost.
 */
export async function getWalletBalances(
  signer: Signer,
  address: string,
  estimatedCostUsdc: string
): Promise<WalletBalances> {
  const provider = signer.provider;
  if (!provider) throw new Error("No provider available");

  // Get ETH balance (for gas)
  const ethBalance = await provider.getBalance(address);
  const ethFormatted = formatEth(ethBalance);

  // Get USDC balance via contract call
  const { ethers } = await import("ethers");
  const usdcContract = new ethers.Contract(
    USDC_CONTRACT_BASE,
    USDC_ABI,
    provider
  );
  const usdcBalance: bigint = await usdcContract.balanceOf(address);
  const decimals: bigint = await usdcContract.decimals();
  const usdcFormatted = formatUsdc(usdcBalance, Number(decimals));

  // Parse estimated cost (e.g. "$2.50" -> 2.5 USDC)
  const costNum = parseCostUsdc(estimatedCostUsdc);

  // ~$0.50 worth of ETH for gas is more than enough on Base
  const minGasEth = parseEth("0.0005");
  const costUsdcWei = BigInt(Math.floor(costNum * 10 ** Number(decimals)));

  return {
    usdc: usdcBalance,
    usdcFormatted,
    eth: ethBalance,
    ethFormatted,
    hasSufficientUsdc: usdcBalance >= costUsdcWei,
    hasSufficientEth: ethBalance >= minGasEth,
    estimatedCostUsdc,
  };
}

function formatEth(wei: bigint): string {
  const eth = Number(wei) / 1e18;
  if (eth < 0.001) return "< 0.001 ETH";
  return `${eth.toFixed(4)} ETH`;
}

function formatUsdc(balance: bigint, decimals: number): string {
  const value = Number(balance) / 10 ** decimals;
  if (value === 0) return "$0.00";
  return `$${value.toFixed(2)}`;
}

function parseCostUsdc(costStr: string): number {
  // Remove $ prefix
  const cleaned = costStr.replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseEth(ethStr: string): bigint {
  const num = parseFloat(ethStr);
  return BigInt(Math.floor(num * 1e18));
}

/**
 * Watch for chain changes on injected wallets.
 * Returns an unsubscribe function.
 */
export function watchChainChanges(
  onChainChanged: (chainId: number) => void
): () => void {
  if (typeof window === "undefined" || !window.ethereum) {
    return () => {};
  }
  const handler = (chainIdHex: unknown) => {
    const chainId = Number(String(chainIdHex));
    onChainChanged(chainId);
  };
  window.ethereum.on?.("chainChanged", handler);
  return () => {
    window.ethereum?.removeListener?.("chainChanged", handler);
  };
}
