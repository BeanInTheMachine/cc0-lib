import { NextResponse } from "next/server";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-static";

function getAccountAssociation() {
  const header = process.env.FARCASTER_HEADER;
  const payload = process.env.FARCASTER_PAYLOAD;
  const signature = process.env.FARCASTER_SIGNATURE;

  if (header && payload && signature) {
    return { header, payload, signature };
  }
  return undefined;
}

export function GET() {
  const siteUrl = getSiteUrl();
  const accountAssociation = getAccountAssociation();

  const manifest = {
    ...(accountAssociation ? { accountAssociation } : {}),
    miniapp: {
      version: "1",
      name: "CC0-LIB",
      iconUrl: `${siteUrl}/miniapp-icon.png`,
      homeUrl: siteUrl,
      splashImageUrl: `${siteUrl}/miniapp-splash.png`,
      splashBackgroundColor: "#18181b",
      subtitle: "Open source CC0 asset lib",
      description:
        "CC0-LIB is a free and open source library of CC0 assets. Browse, download, and share Nouns DAO CC0 art, video, audio, and 3D files.",
      primaryCategory: "art-creativity",
      tags: ["cc0", "assets", "nouns", "library", "design"],
      heroImageUrl: `${siteUrl}/miniapp-hero.png`,
      tagline: "Free CC0 assets for everyone",
      ogTitle: "CC0-LIB",
      ogDescription: "A free and open source library of CC0 assets.",
      ogImageUrl: `${siteUrl}/miniapp-hero.png`,
      noindex: false,
    },
  };

  return NextResponse.json(manifest);
}
