import { getSiteUrl } from "@/lib/site-url";

type BuildEmbedArgs = {
  imageUrl: string;
  buttonTitle: string;
  url: string;
};

export function buildEmbed({
  imageUrl,
  buttonTitle,
  url,
}: BuildEmbedArgs): Record<string, string> {
  const siteUrl = getSiteUrl();
  const splashImageUrl = `${siteUrl}/miniapp-splash.png`;
  const splashBackgroundColor = "#18181b";
  const name = "CC0-LIB";

  const miniapp = {
    version: "1",
    imageUrl,
    button: {
      title: buttonTitle,
      action: {
        type: "launch_miniapp",
        url,
        name,
        splashImageUrl,
        splashBackgroundColor,
      },
    },
  };

  const frame = {
    ...miniapp,
    button: {
      ...miniapp.button,
      action: { ...miniapp.button.action, type: "launch_frame" },
    },
  };

  return {
    "fc:miniapp": JSON.stringify(miniapp),
    "fc:frame": JSON.stringify(frame),
  };
}
