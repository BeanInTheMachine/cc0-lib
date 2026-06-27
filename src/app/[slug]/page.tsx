import Link from "next/link";
import { notFound } from "next/navigation";
import Iframe from "react-iframe";
import {
  ChevronsDown,
  LinkIcon,
  User,
} from "lucide-react";
import AudioPlayer from "@/components/ui/audio-player";
import VideoPlayer from "@/components/ui/video-player";
import SocialShare from "@/components/ui/social-share";
import { getItemBySlug, shortDomainName, slugify } from "@/lib/metadata";
import DownloadFile from "@/components/data/dl";
import Container from "@/components/ui/container";
import Divider from "@/components/ui/divider";
import ModelViewer from "@/components/ui/model-viewer";
import { Route } from "next";
import GatewayImage from "@/components/ui/gateway-image";

type DetailsPageProps = {
  params: Promise<{ slug: string }>;
};

export const generateMetadata = async ({ params }: DetailsPageProps) => {
  const { slug } = await params;
  const data = getItemBySlug(slug);
  return {
    title: `${data?.Title} | CC0-LIB`,
    description: data?.Description,
    image: data?.ThumbnailURL || "https://cc0-lib.wtf/og.png",
    url: `https://cc0-lib.wtf/${slug}`,
    type: "website",
    openGraph: {
      title: `${data?.Title} | CC0-LIB`,
      description: data?.Description,
      url: `https://cc0-lib.wtf/${slug}`,
      type: "website",
      images: [
        {
          url: data?.ThumbnailURL || "https://cc0-lib.wtf/og.png",
          width: 800,
          height: 400,
          alt: data?.Title,
        },
      ],
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: `${data?.Title} | CC0-LIB`,
      description: data?.Description,
      images: [data?.ThumbnailURL || "https://cc0-lib.wtf/og.png"],
    },
  };
};

const DetailsPage = async ({ params }: DetailsPageProps) => {
  const { slug } = await params;
  const data = getItemBySlug(slug);

  if (!data) {
    notFound();
  }

  return (
    <Container>
      {data && data.Type === "3D" && data.Filetype === "GLB" && (
        <div className="hidden h-auto w-full max-w-5xl items-center justify-center sm:block">
          <ModelViewer data={data} />
        </div>
      )}

      {data && data.Type === "Video" && data.File && (
        <VideoPlayer src={data.File} data={data} className="" />
      )}

      {data && data.Type === "Audio" && data.File && (
        <AudioPlayer
          format={data.Filetype}
          href={data.File}
          className="w-full max-w-3xl sm:w-3/5"
        />
      )}

      {data && data.Type === "Working Files" && data.Filetype === "Figma" && (
        <iframe
          src={`https://www.figma.com/embed?embed_host=share&url=${data.File}`}
          title="Figma Viewer"
          className="hidden h-screen w-full max-w-5xl px-2 py-16 sm:block sm:p-16"
          allowFullScreen
        />
      )}

      {data &&
        data.Type === "Working Files" &&
        data.Filetype === "PDF" &&
        data.File && (
          <Iframe
            url={data.File}
            title="PDF Viewer"
            className="h-screen w-full max-w-5xl px-0 py-8 sm:p-16"
          />
        )}

      {data && (data.Type === "Image" || data.Type === "GIF") && (
        <GatewayImage
          src={data.ThumbnailURL as string}
          alt={data.Title}
          width={768}
          height={768}
          className="h-auto w-full max-w-3xl object-cover px-2 py-16 shadow-md sm:w-3/4 sm:p-16"
        />
      )}

      {data && (data.Type === "3D" || data.Type === "Working Files") && (
        <GatewayImage
          src={data.ThumbnailURL as string}
          alt={data.Title}
          width={768}
          height={768}
          className="block h-auto w-full max-w-5xl object-cover px-2 py-16 shadow-md sm:hidden sm:p-16"
        />
      )}

      {!data && (
        <Link href="/">
          <h1 className="bg-zinc-800 px-12 py-6 font-chakra text-5xl uppercase text-orange-600 hover:bg-orange-600 hover:text-zinc-800 sm:text-9xl">
            ERROR
          </h1>
        </Link>
      )}

      {data &&
        (data.Type === "Image" ||
          data.Type === "GIF" ||
          data.Type === "Video" ||
          data.Filetype === "Figma") && <MoreDetails />}

      {data && (
        <div className="flex w-full max-w-5xl flex-col items-center justify-between gap-4 p-2 sm:flex-row sm:p-16">
          <div className="duration-250 flex w-full flex-col gap-4 font-spline text-2xl text-white transition-all ease-linear">
            <div className="flex flex-row gap-4">
              <span className="flex flex-row gap-2 text-sm text-zinc-400">
                <User className="h-4 w-4 self-center" />
                {data?.ENS ? (
                  <Link
                    href={data?.["Social Link"] as Route}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-row gap-1 hover:text-prim"
                  >
                    {data?.ENS}
                  </Link>
                ) : (
                  <span>cc0-lib</span>
                )}
              </span>
            </div>

            <span className="font-rubik text-3xl text-prim md:-ml-1 md:text-5xl">
              {data?.Title}
            </span>
            <span className="max-w-prose text-lg">{data?.Description}</span>
            <div className="place flex h-6 w-full flex-row justify-between gap-4 text-base lowercase sm:w-1/3 sm:text-lg">
              {data?.Source && (
                <Link
                  href={data?.Source as Route}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-row gap-1 hover:text-prim"
                >
                  {shortDomainName(data?.Source)}
                  <LinkIcon className="h-4 w-4 self-center group-hover:stroke-prim" />
                </Link>
              )}
              {data.File && <DownloadFile data={data} showExtension={true} />}
              <SocialShare data={data} />
            </div>

            <div className="flex w-full flex-col gap-1 text-sm text-zinc-400">
              {data?.Type && (
                <span className="flex flex-row items-center gap-2 lowercase">
                  <span>type:</span>
                  <Link
                    href={`/?type=${data.Type.toLowerCase()}`}
                    className="hover:text-prim"
                  >
                    {data.Type}
                  </Link>
                </span>
              )}
              {data?.Filetype && (
                <span className="flex flex-row items-center gap-2 lowercase">
                  <span>format:</span>
                  <Link
                    href={`/?format=${data.Filetype.toLowerCase()}`}
                    className="hover:text-prim"
                  >
                    {data.Filetype}
                  </Link>
                </span>
              )}

              {data?.ID && (
                <span className="flex flex-row items-center gap-2 lowercase">
                  <span>id:</span>
                  {data.ID}
                </span>
              )}

              {data?.Tags && data?.Tags.length >= 1 && (
                <span className="flex flex-row items-start gap-2 lowercase">
                  <span>tags:</span>
                  <div className="grid grid-cols-3 text-center sm:grid-cols-5">
                    {data.Tags.map((tag) => (
                      <Link
                        href={`/?tag=${tag.toLowerCase()}`}
                        key={tag}
                        className="px-1 py-0 hover:text-prim sm:px-2"
                      >
                        {tag}
                      </Link>
                    ))}
                  </div>
                </span>
              )}
            </div>

            <Divider className="max-w-sm" />

          </div>

          {(data?.Type === "Image" ||
            data?.Type === "GIF" ||
            data?.Type === "Working Files" ||
            data?.Type === "3D") && (
            <GatewayImage
              src={data.ThumbnailURL as string}
              alt={data.Title}
              width={500}
              height={500}
              className="hidden h-auto w-2/5 object-cover px-2 shadow-md lg:block"
            />
          )}

          {data?.Type === "Video" && (
            <GatewayImage
              src={data.ThumbnailURL as string}
              alt={data.Title}
              width={500}
              height={500}
              className="hidden h-auto w-1/3 object-cover px-2 shadow-md sm:block"
            />
          )}

          {data?.Type === "Audio" && (
            <GatewayImage
              src={data.ThumbnailURL as string}
              alt={data.Title}
              width={500}
              height={500}
              className="hidden h-auto w-2/5 object-cover px-2 shadow-md sm:block"
            />
          )}
        </div>
      )}

      <CC0Details />
    </Container>
  );
};
export default DetailsPage;

const MoreDetails = () => {
  return (
    <div className="hidden flex-row items-center justify-between gap-4 text-zinc-600 sm:flex">
      <span>more</span>
      <ChevronsDown className="h-6 w-6" />
      <span>details</span>
    </div>
  );
};

const CC0Details = () => {
  return (
    <div className="mt-4 flex flex-row items-center justify-center gap-2 text-xs text-zinc-600">
      this work is marked with{" "}
      <Link
        href="https://creativecommons.org/publicdomain/zero/1.0/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-zinc-500 hover:text-prim"
      >
        CC0 1.0 Universal
      </Link>
      <a
        href="https://creativecommons.org/publicdomain/zero/1.0/"
        target="_blank"
        rel="license noopener noreferrer"
      />
    </div>
  );
};
