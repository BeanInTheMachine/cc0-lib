import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getItemSlug } from "@/lib/metadata";
import { getSiteUrl } from "@/lib/site-url";

const submitSchema = z.object({
  arweaveId: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Invalid Arweave transaction ID"),
  title: z.string().min(3).max(50),
  description: z.string().min(3).max(300),
  type: z.enum(["Image", "Video", "Audio", "3D", "Working Files"]),
  filetype: z.string().min(1).max(20),
  tags: z.array(z.string().min(1).max(30)).max(20),
  ens: z.string().optional(),
  source: z.string().url().optional(),
  socialLink: z.string().url().optional(),
  filename: z.string().optional(),
});

function generateId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 21; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

const GITHUB_API = "https://api.github.com";
const METADATA_PATH = "src/data/metadata.json";
const BRANCH = "main";

async function gh(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `GitHub API ${init?.method ?? "GET"} ${path} failed: ${res.status} ${errBody}`
    );
  }

  return res.json();
}

// Reads metadata.json via the Git Data API (Blob API supports up to 100MB,
// unlike the Contents API which omits content for files over 1MB).
async function readMetadata(
  owner: string,
  repo: string,
  token: string
): Promise<{ items: Item[]; baseCommitSha: string; baseTreeSha: string }> {
  const base = `/repos/${owner}/${repo}`;

  const ref = await gh(`${base}/git/ref/heads/${BRANCH}`, token);
  const baseCommitSha = ref.object.sha as string;

  const commit = await gh(`${base}/git/commits/${baseCommitSha}`, token);
  const baseTreeSha = commit.tree.sha as string;

  const fileMeta = await gh(
    `${base}/contents/${METADATA_PATH}?ref=${baseCommitSha}`,
    token
  );
  const blob = await gh(`${base}/git/blobs/${fileMeta.sha}`, token);
  const content = Buffer.from(blob.content, blob.encoding).toString("utf-8");

  return {
    items: JSON.parse(content) as Item[],
    baseCommitSha,
    baseTreeSha,
  };
}

// Commits new content via the Git Data API: blob -> tree -> commit -> ref.
async function commitMetadata(
  owner: string,
  repo: string,
  token: string,
  baseCommitSha: string,
  baseTreeSha: string,
  newContent: string,
  message: string
): Promise<void> {
  const base = `/repos/${owner}/${repo}`;

  const blob = await gh(`${base}/git/blobs`, token, {
    method: "POST",
    body: JSON.stringify({ content: newContent, encoding: "utf-8" }),
  });

  const tree = await gh(`${base}/git/trees`, token, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: [
        { path: METADATA_PATH, mode: "100644", type: "blob", sha: blob.sha },
      ],
    }),
  });

  const commit = await gh(`${base}/git/commits`, token, {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [baseCommitSha],
    }),
  });

  await gh(`${base}/git/refs/heads/${BRANCH}`, token, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
}

export async function POST(request: NextRequest) {
  const githubToken = process.env.GITHUB_TOKEN;
  const githubOwner = process.env.GITHUB_OWNER;
  const githubRepo = process.env.GITHUB_REPO;

  if (!githubToken || !githubOwner || !githubRepo) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const {
    arweaveId,
    title,
    description,
    type,
    filetype,
    tags,
    ens,
    source,
    socialLink,
    filename,
  } = parsed.data;

  const arweaveUrl = `https://arweave.net/${arweaveId}`;

  const newItem: Item = {
    id: generateId(),
    Title: title,
    Description: description,
    Type: type,
    Filetype: filetype,
    Thumbnails: [
      {
        name: filename ?? "",
        url: arweaveUrl,
        rawUrl: arweaveUrl,
      },
    ],
    ThumbnailURL: arweaveUrl,
    Source: source ?? "",
    Status: "published",
    SubmissionStatus: "submitted",
    Tags: tags,
    ENS: ens ?? "",
    ID: 0,
    "Social Link": socialLink ?? "",
    File: arweaveUrl,
    ParentDB: "",
  };

  let attempt = 0;
  const maxRetries = 2;

  while (attempt <= maxRetries) {
    try {
      const { items, baseCommitSha, baseTreeSha } = await readMetadata(
        githubOwner,
        githubRepo,
        githubToken
      );

      const maxId = items.reduce(
        (max, item) => Math.max(max, item.ID ?? 0),
        0
      );
      newItem.ID = maxId + 1;

      items.push(newItem);

      const newContent = JSON.stringify(items, null, 2);

      const ensLabel = ens ? ` by ${ens}` : "";
      await commitMetadata(
        githubOwner,
        githubRepo,
        githubToken,
        baseCommitSha,
        baseTreeSha,
        newContent,
        `submit: ${title}${ensLabel}`
      );

      const slug = getItemSlug(newItem);

      return NextResponse.json(
        {
          id: newItem.id,
          title: newItem.Title,
          slug,
          url: `${getSiteUrl()}/${slug}`,
        },
        { status: 200 }
      );
    } catch (err) {
      if (attempt < maxRetries) {
        attempt++;
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      const message =
        err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }
}
