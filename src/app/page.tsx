import { readMetadata } from "@/lib/metadata";
import { getSiteUrl } from "@/lib/site-url";
import { buildEmbed } from "@/lib/miniapp-embed";
import FrontPage from "./front-page";

export const generateMetadata = () => {
  const title = "CC0-LIB";
  const description = "CC0-LIB is a free and open source library of CC0 assets";
  const siteUrl = getSiteUrl();
  const image = `${siteUrl}/og.png`;
  const url = siteUrl;

  return {
    title,
    description,
    image,
    url,
    type: "website",
    openGraph: {
      title,
      description,
      url,
      type: "website",
      images: [{ url: image, width: 800, height: 400, alt: title }],
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    other: buildEmbed({
      imageUrl: `${siteUrl}/miniapp-embed.png`,
      buttonTitle: "Browse CC0 assets",
      url: siteUrl,
    }),
  };
};

export default function Home() {
  const data = readMetadata().filter((item) => item.Status === "published");

  return <FrontPage initialData={data} />;
}
