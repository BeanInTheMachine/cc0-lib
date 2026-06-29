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

async function fetchMetadataFile(
  owner: string,
  repo: string,
  token: string
): Promise<{ content: string; sha: string }> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/src/data/metadata.json`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GitHub API error fetching metadata: ${res.status} ${body}`
    );
  }

  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { content, sha: data.sha };
}

async function commitMetadataFile(
  owner: string,
  repo: string,
  token: string,
  sha: string,
  newContent: string,
  message: string
): Promise<void> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/src/data/metadata.json`;
  const body = {
    message,
    content: Buffer.from(newContent).toString("base64"),
    sha,
    branch: "main",
  };

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `GitHub API error committing metadata: ${res.status} ${errBody}`
    );
  }
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
      const { content, sha } = await fetchMetadataFile(
        githubOwner,
        githubRepo,
        githubToken
      );

      const metadataItems = JSON.parse(content) as Item[];

      const maxId = metadataItems.reduce(
        (max, item) => Math.max(max, item.ID ?? 0),
        0
      );
      newItem.ID = maxId + 1;

      metadataItems.push(newItem);

      const newContent = JSON.stringify(metadataItems, null, 2);

      const ensLabel = ens ? ` by ${ens}` : "";
      await commitMetadataFile(
        githubOwner,
        githubRepo,
        githubToken,
        sha,
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
