import { readMetadata } from "@/lib/metadata";
import FavPage from "./fav-page";

export const generateMetadata = () => {
  const title = "Fav | CC0-LIB";
  const description = "Favourite Content";
  const image = "https://cc0-lib.wtf/og.png";
  const url = "https://cc0-lib.wtf/fav";

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
  const data = readMetadata().filter((item) => item.Status === "published");

  return <FavPage initialData={data} />;
}
