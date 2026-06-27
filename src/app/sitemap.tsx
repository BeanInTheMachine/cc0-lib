import { staticPages } from "@/lib/constants";
import { readMetadata, slugify } from "@/lib/metadata";

const url = "https://cc0-lib.wtf";

export default function sitemap() {
  const itemData = readMetadata().filter((item) => item.Status === "published");
  const items = itemData.map((item) => ({
    url: `${url}/${slugify(item.Title)}`,
    lastModified: new Date().toISOString(),
  }));

  const pages = staticPages.map((page) => ({
    url: `${url}/${page}`,
    lastModified: new Date().toISOString(),
  }));

  return [...pages, ...items];
}
