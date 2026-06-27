import metadata from "@/data/metadata.json";

export function readMetadata(): Item[] {
  return metadata as Item[];
}

export function getItemBySlug(slug: string): Item | null {
  const items = readMetadata();
  const match = items.find((item) => slugify(item.Title) === slug);
  return match ?? null;
}

export function getLeaderboard(items: Item[]): {
  top10: { ens: string; count: number }[];
  top10Data: { ens: string; data: Item[]; count: number }[];
  full: { ens: string; count: number }[];
} {
  const ensList = Array.from(
    new Set(
      items
        .map((item) => item.ENS ?? null)
        .filter((e): e is string => e !== null && e !== "")
    )
  );

  const ensCount = ensList
    .map((ens) => ({
      ens,
      count: items.filter((item) => item.ENS === ens).length,
    }))
    .sort((a, b) => b.count - a.count);

  const top10 = ensCount.slice(0, 20);

  const top10Data = top10.map((ens) => {
    const data = items.filter((item) => item.ENS === ens.ens);
    return { ens: ens.ens, data, count: ens.count };
  });

  return { top10, top10Data, full: ensCount };
}

export function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function shortDomainName(source: string): string {
  return source
    .replace("http://", "")
    .replace("https://", "")
    .replace("www.", "")
    .split("/")[0];
}
