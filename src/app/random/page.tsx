import DownloadFile from "@/components/data/dl";
import Container from "@/components/ui/container";
import { readMetadata, slugify } from "@/lib/metadata";
import { getSiteUrl } from "@/lib/site-url";
import { MoreHorizontal, RefreshCcw } from "lucide-react";
import GatewayImage from "@/components/ui/gateway-image";
import Link from "next/link";

export const generateMetadata = () => {
  const title = "Random | CC0-LIB";
  const description = "Random image from CC0-LIB";
  const siteUrl = getSiteUrl();
  const image = `${siteUrl}/og.png`;
  const url = `${siteUrl}/random`;

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

const RandomPage = () => {
  const data = readMetadata().filter((item) => item.Status === "published");
  const randomItem = data[Math.floor(Math.random() * data.length)];

  if (!randomItem) {
    return (
      <Container>
        <div className="flex flex-col items-center justify-center gap-8 p-2">
          <p className="text-2xl text-zinc-400">No items available</p>
          <Link href="/" className="text-prim hover:underline">Browse library</Link>
        </div>
      </Container>
    );
  }

  const image = randomItem.ThumbnailURL || "";

  return (
    <Container>
      <div className="flex flex-col items-center justify-center gap-8 p-2">
        <div className="items-center">
          <GatewayImage
            src={image}
            alt="random image"
            width={384}
            height={384}
            className="h-96 w-96 object-contain p-2 ring-1 ring-zinc-800 ring-offset-1 ring-offset-zinc-800 hover:ring-prim"
          />
        </div>
        <div className="flex w-full flex-col justify-between gap-4 sm:flex-row sm:gap-2">
          <div className="flex w-52 flex-row justify-items-start">
            <span className="truncate">
              {slugify(randomItem.Title.toLowerCase())}
            </span>
            <span>.{randomItem.Filetype.toLowerCase()}</span>
          </div>
          <div className="flex flex-row items-center gap-4">
            {randomItem.File && (
              <DownloadFile data={randomItem} showExtension={false} />
            )}
            <Link href="/random" className="hover:text-prim">
              <button aria-label="refresh content">
                <RefreshCcw className="ml-2 inline-block h-4 w-4 items-center" />
              </button>
            </Link>
            <Link
              href={`/${slugify(randomItem.Title)}`}
              className="hover:text-prim"
            >
              <MoreHorizontal className="ml-2 inline-block h-4 w-4 items-center" />
            </Link>
          </div>
        </div>
      </div>
    </Container>
  );
};
export default RandomPage;
