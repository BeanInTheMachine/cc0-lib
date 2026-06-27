import Container from "@/components/ui/container";
import { staticPages } from "@/lib/constants";
import { readMetadata, shuffle, slugify } from "@/lib/metadata";
import Link from "next/link";

export const generateMetadata = () => {
  const title = "Sitemap | CC0-LIB";
  const description = "CC0-LIB sitemap";
  const image = "https://cc0-lib.wtf/og.png";
  const url = "https://cc0-lib.wtf/sitemap";

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

const SiteMapPage = () => {
  const data = readMetadata().filter((item) => item.Status === "published");

  const tagsList: string[] = shuffle(
    Array.from(
      new Set(
        data
          .map((item) => item.Tags ?? [])
          .flat()
      )
    )
  );

  const typeList: string[] = shuffle(
    Array.from(
      new Set(
        data
          .map((item) => item.Type)
          .filter(Boolean)
      )
    )
  );

  const formatList: string[] = shuffle(
    Array.from(
      new Set(
        data
          .map((item) => item.Filetype)
          .filter(Boolean)
      )
    )
  );

  const pages: string[] = shuffle(staticPages);

  return (
    <Container>
      <div className="duration-250 peer w-full bg-transparent px-4 py-16 font-rubik leading-8 text-prim drop-shadow-md transition-all ease-linear selection:bg-zinc-800 selection:text-sec placeholder:text-zinc-600 focus:rounded-sm focus:bg-zinc-800 focus:bg-opacity-50 focus:outline-none focus:backdrop-blur-md sm:p-16">
        {data.length > 0 && (
          <span className="mr-4 font-rubik text-2xl sm:text-4xl">
            {data.length} items in the library +++
          </span>
        )}
        {pages.map((page) => (
          <Link
            href={`/${page.toLowerCase()}`}
            className="mr-4 break-all text-2xl lowercase text-zinc-600 hover:text-prim sm:text-4xl"
            key={page}
          >
            {page}
          </Link>
        ))}
        {typeList.map((type) => (
          <Link
            href={`/?type=${type.toLowerCase()}`}
            className="mr-4 break-all text-2xl lowercase text-zinc-600 hover:text-prim sm:text-4xl"
            key={type}
          >
            {type}
          </Link>
        ))}
        {formatList.map((format) => (
          <Link
            href={`/?format=${format.toLowerCase()}`}
            className="mr-4 break-all text-2xl lowercase text-zinc-600 hover:text-prim sm:text-4xl"
            key={format}
          >
            {format}
          </Link>
        ))}
        {tagsList.map((tag) => (
          <Link
            href={`/?tag=${tag.toLowerCase()}`}
            className="mr-4 break-all text-2xl lowercase text-zinc-600 hover:text-prim sm:text-4xl"
            key={tag}
          >
            {tag}
          </Link>
        ))}
        {data.map((item) => (
          <Link
            href={`/${slugify(item.Title)}`}
            className="mr-4 break-all text-2xl lowercase text-zinc-600 hover:text-prim sm:text-4xl"
            key={item.id}
          >
            {item.Title}
          </Link>
        ))}
      </div>
    </Container>
  );
};
export default SiteMapPage;
