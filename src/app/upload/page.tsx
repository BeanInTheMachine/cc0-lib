import { getSiteUrl } from "@/lib/site-url";
import UploadPage from "./upload-page";

export const generateMetadata = async () => {
  const title = "Upload | CC0-LIB";
  const description = "Upload CC0 assets to the library. Free for files under 100KB, or pay with crypto for larger files.";
  const siteUrl = getSiteUrl();
  const image = `${siteUrl}/miniapp-embed.png`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${siteUrl}/upload`,
      type: "website",
      images: [{ url: image, width: 1200, height: 800, alt: title }],
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

export default function UploadPageServer() {
  return <UploadPage />;
}
