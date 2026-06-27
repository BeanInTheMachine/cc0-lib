import * as fs from "node:fs";
import * as path from "node:path";

const NOTION_DB_LIST_ID = "aa37f2c026274d75a45ebf5fabdefbd6";
const SPLITBEE_BASE = "https://notion-api.splitbee.io/v1";

const ARWEAVE_GQL_ENDPOINTS = [
  "https://arweave.net/graphql",
  "https://gateway.irys.xyz/graphql",
];

const ARWEAVE_TX_ID_RE = /arweave\.net\/([A-Za-z0-9_-]{43})/;

interface NotionDBRow {
  ID: string;
}

interface NotionItem {
  id: string;
  Title?: string;
  Description?: string;
  Type?: string;
  Filetype?: string;
  Thumbnails?: { name?: string; url?: string; rawUrl?: string }[];
  ThumbnailURL?: string;
  Source?: string;
  Status?: string;
  Tags?: string[];
  ENS?: string;
  ID?: number;
  "Social Link"?: string;
  File?: string;
  SubmissionStatus?: string;
}

interface MetadataItem {
  id: string;
  Title: string;
  Description: string;
  Type: string;
  Filetype: string;
  Thumbnails: { name: string; url: string; rawUrl: string }[];
  ThumbnailURL: string;
  Source: string;
  Status: string;
  Tags: string[];
  ENS: string;
  ID: number;
  "Social Link": string;
  File: string;
  ParentDB: string;
}

interface ArweaveTag {
  name: string;
  value: string;
}

interface ArweaveTransactionNode {
  id: string;
  block: { timestamp: number };
  tags: ArweaveTag[];
}

interface UnmappedAsset {
  arweaveId: string;
  filename: string;
  contentType: string;
  uploaderENS: string;
  app: string;
  timestamp: number;
}

function extractArweaveId(url: string): string | null {
  const match = url.match(ARWEAVE_TX_ID_RE);
  return match ? match[1] : null;
}

function getTag(node: ArweaveTransactionNode, name: string): string {
  const tag = node.tags.find((t) => t.name === name);
  return tag?.value ?? "";
}

function getAllArweaveIds(items: MetadataItem[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.File) {
      const id = extractArweaveId(item.File);
      if (id) ids.add(id);
    }
    if (item.ThumbnailURL) {
      const id = extractArweaveId(item.ThumbnailURL);
      if (id) ids.add(id);
    }
    for (const thumb of item.Thumbnails ?? []) {
      if (thumb.url) {
        const id = extractArweaveId(thumb.url);
        if (id) ids.add(id);
      }
      if (thumb.rawUrl) {
        const id = extractArweaveId(thumb.rawUrl);
        if (id) ids.add(id);
      }
    }
  }
  return ids;
}

function trimTags(tags: string[]): string[] {
  return tags.map((t) => t.trim()).filter((t) => t !== "");
}

async function fetchWithRetry(
  url: string,
  retries = 3
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from ${url}`);
      }
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`  retry ${i + 1}/${retries} for ${url}`);
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} retries`);
}

async function fetchNotionData(): Promise<MetadataItem[]> {
  console.log("Fetching Notion master DB list...");
  const masterRes = await fetchWithRetry(
    `${SPLITBEE_BASE}/table/${NOTION_DB_LIST_ID}`
  );
  const dbList: NotionDBRow[] = await masterRes.json();
  const childDbIds = dbList.map((db) => db.ID);
  console.log(`Found ${childDbIds.length} child databases`);

  const allItems: MetadataItem[] = [];

  for (const dbId of childDbIds) {
    console.log(`  Fetching DB ${dbId}...`);
    const res = await fetchWithRetry(`${SPLITBEE_BASE}/table/${dbId}`);
    const items: NotionItem[] = await res.json();

    const processed = items.map((item) => {
      const metadata: MetadataItem = {
        id: item.id,
        Title: item.Title ?? "",
        Description: item.Description ?? "",
        Type: item.Type ?? "",
        Filetype: item.Filetype ?? "",
        Thumbnails: (item.Thumbnails ?? []).map((t) => ({
          name: t.name ?? "",
          url: t.url ?? "",
          rawUrl: t.rawUrl ?? "",
        })),
        ThumbnailURL: item.ThumbnailURL ?? "",
        Source: item.Source ?? "",
        Status: item.Status ?? "published",
        Tags: trimTags(item.Tags ?? []),
        ENS: item.ENS ?? "",
        ID: item.ID ?? 0,
        "Social Link": item["Social Link"] ?? "",
        File: item.File ?? "",
        ParentDB: dbId,
      };
      return metadata;
    });

    allItems.push(...processed);
    console.log(`    -> ${processed.length} items`);
  }

  return allItems;
}

async function tryFetchGraphQL(
  endpoint: string,
  query: string,
  variables: Record<string, unknown>
): Promise<{ data: { transactions: { pageInfo: { hasNextPage: boolean }; edges: { cursor: string; node: ArweaveTransactionNode }[] } } } | null> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.log(`    HTTP ${res.status} from ${endpoint}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`    fetch error from ${endpoint}: ${msg}`);
    return null;
  }
}

async function fetchArweaveTransactions(): Promise<ArweaveTransactionNode[]> {
  const query = `
    query($cursor: String) {
      transactions(
        tags: [
          { name: "App", values: ["cc0-lib uploader", "cc0-lib desktop uploader"] }
        ]
        after: $cursor
        first: 100
      ) {
        pageInfo { hasNextPage }
        edges {
          cursor
          node {
            id
            block { timestamp }
            tags { name value }
          }
        }
      }
    }
  `;

  const allNodes: ArweaveTransactionNode[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;
  let page = 0;

  let activeEndpoint = ARWEAVE_GQL_ENDPOINTS[0];
  console.log(`Querying Arweave GraphQL...`);

  while (hasNextPage) {
    page++;

    let json: Awaited<ReturnType<typeof tryFetchGraphQL>> = null;

    for (const endpoint of ARWEAVE_GQL_ENDPOINTS) {
      json = await tryFetchGraphQL(endpoint, query, { cursor });
      if (json) {
        activeEndpoint = endpoint;
        break;
      }
      console.log(`  ${endpoint} unavailable, trying next...`);
    }

    if (!json) {
      console.log(`  All gateways unavailable, stopping.`);
      break;
    }

    const edges = json.data?.transactions?.edges ?? [];
    const pageInfo = json.data?.transactions?.pageInfo ?? {};

    for (const edge of edges) {
      allNodes.push(edge.node);
      cursor = edge.cursor;
    }
    hasNextPage = pageInfo.hasNextPage ?? false;

    console.log(
      `  Page ${page} via ${activeEndpoint}: ${allNodes.length} transactions so far`
    );

    if (edges.length === 0) break;
  }

  return allNodes;
}

function arweaveNodeToMetadataItem(
  node: ArweaveTransactionNode
): MetadataItem {
  const filename = getTag(node, "Filename") || "untitled";
  const contentType = getTag(node, "Content-Type") || "application/octet-stream";
  const uploader = getTag(node, "Uploader") || "";
  const type = contentType.startsWith("image/")
    ? contentType.includes("gif")
      ? "GIF"
      : "Image"
    : contentType.startsWith("video/")
      ? "Video"
      : contentType.startsWith("audio/")
        ? "Audio"
        : contentType.includes("model")
          ? "3D"
          : "Working Files";
  const filetype = contentType.split("/").pop()?.toUpperCase() ?? "UNKNOWN";

  return {
    id: node.id,
    Title: filename.replace(/\.[^.]+$/, ""),
    Description: `Uploaded by ${uploader || "unknown"}`,
    Type: type,
    Filetype: filetype,
    Thumbnails: [],
    ThumbnailURL: `https://arweave.net/${node.id}`,
    Source: "",
    Status: "published",
    Tags: ["cc0-lib-upload"],
    ENS: uploader,
    ID: 0,
    "Social Link": "",
    File: `https://arweave.net/${node.id}`,
    ParentDB: "",
  };
}

async function main() {
  console.log("=== cc0-lib Legacy Import ===\n");

  // --- Part A: Notion Extraction ---
  console.log("--- Part A: Notion Extraction ---");
  let allItems: MetadataItem[] = [];
  let notionOk = false;
  try {
    allItems = await fetchNotionData();
    notionOk = true;
    console.log(`Total Notion items: ${allItems.length}`);
  } catch (err) {
    console.error("Failed to fetch Notion data:", err);
    console.log("Continuing with Arweave-only data...\n");
  }

  // --- Part B: Arweave Extraction ---
  console.log(`${notionOk ? "Part B" : "Part A"}: Arweave Extraction ---`);
  let arweaveNodes: ArweaveTransactionNode[] = [];
  try {
    arweaveNodes = await fetchArweaveTransactions();
    console.log(`Total Arweave transactions: ${arweaveNodes.length}`);
  } catch (err) {
    console.error("Failed to fetch Arweave data:", err);
  }

  let publishedItems: MetadataItem[];

  if (notionOk) {
    publishedItems = allItems.filter((item) => item.Status === "published");
    const draftItems = allItems.filter((item) => item.Status === "draft");
    console.log(
      `Published: ${publishedItems.length}, Draft: ${draftItems.length}`
    );

    // --- Part C: Arweave Cross-Reference (only if Notion succeeded) ---
    console.log("\n--- Part C: Arweave Cross-Reference ---");
    const knownArweaveIds = getAllArweaveIds(publishedItems);
    console.log(`Known Arweave IDs from metadata: ${knownArweaveIds.size}`);

    const unmatched: UnmappedAsset[] = [];
    for (const node of arweaveNodes) {
      if (!knownArweaveIds.has(node.id)) {
        unmatched.push({
          arweaveId: node.id,
          filename: getTag(node, "Filename"),
          contentType: getTag(node, "Content-Type"),
          uploaderENS: getTag(node, "Uploader"),
          app: getTag(node, "App"),
          timestamp: node.block?.timestamp ?? 0,
        });
      }
    }

    const unmappedPath = path.resolve(
      __dirname,
      "..",
      "src",
      "data",
      "unmapped-assets.json"
    );
    fs.writeFileSync(unmappedPath, JSON.stringify(unmatched, null, 2));
    console.log(`Wrote ${unmatched.length} unmatched assets to ${unmappedPath}`);
    console.log(`Skipped drafts: ${draftItems.length}`);
  } else {
    // --- Notion failed: build catalog from Arweave transactions ---
    console.log("\nBuilding metadata from Arweave transactions...");
    publishedItems = arweaveNodes.map(arweaveNodeToMetadataItem);
    const seen = new Set<string>();
    publishedItems = publishedItems.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    publishedItems.forEach((item, i) => {
      item.ID = i + 1;
    });
    console.log(`Created ${publishedItems.length} items from Arweave`);

    // Arweave-only: no unmapped (everything is in metadata)
    const unmappedPath = path.resolve(
      __dirname,
      "..",
      "src",
      "data",
      "unmapped-assets.json"
    );
    fs.writeFileSync(unmappedPath, JSON.stringify([], null, 2));
  }

  const metadataPath = path.resolve(
    __dirname,
    "..",
    "src",
    "data",
    "metadata.json"
  );
  fs.writeFileSync(metadataPath, JSON.stringify(publishedItems, null, 2));
  console.log(`\nWrote ${publishedItems.length} items to ${metadataPath}`);

  console.log("\n=== Import Complete ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
