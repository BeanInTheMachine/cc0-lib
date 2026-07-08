export const ARWEAVE_GATEWAYS = [
  "https://arweave.net",
  "https://ar-io.net",
  "https://turbo-gateway.com",
];

const ARWEAVE_TX_ID_RE = /arweave\.net\/([A-Za-z0-9_-]{43})/;

export function extractArweaveId(url: string): string | null {
  const match = url.match(ARWEAVE_TX_ID_RE);
  return match ? match[1] : null;
}
