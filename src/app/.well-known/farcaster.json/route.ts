import { NextResponse } from "next/server";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-static";

// Signed proof that the cc0-lib.xyz domain is owned by its Farcaster author
// (FID 369904). This is public, non-secret data served at the well-known URL.
// Env vars override it (e.g. on a domain/account change) without a code edit.
const ACCOUNT_ASSOCIATION = {
  header:
    "eyJmaWQiOjM2OTkwNCwidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweGEwMkM1MzNiODk1NTU2QUFGRDVmRGI0YzczYzVDQTRkM0VhQmQ0RTIifQ",
  payload: "eyJkb21haW4iOiJjYzAtbGliLnh5eiJ9",
  signature:
    "y1nHOysySTrtkPpPUFvAK4tnvmXl+voRTBDrEp0fbEsIAKuyL1DMZTG83emtzC3uYNo6STAmyAL58tai9fgZdRs=",
};

function getAccountAssociation() {
  const header = process.env.FARCASTER_HEADER ?? ACCOUNT_ASSOCIATION.header;
  const payload = process.env.FARCASTER_PAYLOAD ?? ACCOUNT_ASSOCIATION.payload;
  const signature =
    process.env.FARCASTER_SIGNATURE ?? ACCOUNT_ASSOCIATION.signature;

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
