import { filterPubliclyVisible, readMetadata } from "@/lib/metadata";
import { getSiteUrl } from "@/lib/site-url";
import FavPage from "./fav-page";

export const generateMetadata = () => {
  const title = "Fav | CC0-LIB";
  const description = "Favourite Content";
  const siteUrl = getSiteUrl();
  const image = `${siteUrl}/og.png`;
  const url = `${siteUrl}/fav`;

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
  };
};

export default function Home() {
  const data = filterPubliclyVisible(readMetadata());

  return <FavPage initialData={data} />;
}
