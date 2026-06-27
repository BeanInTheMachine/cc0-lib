import { staticPages } from "@/lib/constants";
import { readMetadata, getItemSlug } from "@/lib/metadata";
import { getSiteUrl } from "@/lib/site-url";

export default function sitemap() {
  const url = getSiteUrl();
  const itemData = readMetadata().filter((item) => item.Status === "published");
  const items = itemData.map((item) => ({
    url: `${url}/${getItemSlug(item)}`,
    lastModified: new Date().toISOString(),
  }));

  const pages = staticPages.map((page) => ({
    url: `${url}/${page}`,
    lastModified: new Date().toISOString(),
  }));

  return [...pages, ...items];
}
