import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const METADATA_PATH = path.resolve("src/data/metadata.json");
const THUMBNAILS_DIR = path.resolve("public/thumbnails");
const DOWNLOAD_TIMEOUT = 120;
const EXTRACT_TIMEOUT = 30;

function main() {
  const raw = fs.readFileSync(METADATA_PATH, "utf-8");
  const items: Item[] = JSON.parse(raw);
  const videos = items.filter((item) => item.Type === "Video");

  fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });

  for (const item of videos) {
    const outputPath = path.join(THUMBNAILS_DIR, `${item.id}.jpg`);

    if (fs.existsSync(outputPath)) {
      console.log(`✓ exists: ${item.Title}`);
      item.ThumbnailURL = `/thumbnails/${item.id}.jpg`;
      continue;
    }

    const videoUrl = `https://arweave.net/${item.id}`;
    const tmpPath = path.join(os.tmpdir(), `cc0-video-${item.id}.mp4`);
    console.log(`→ ${item.Title} (${item.id})`);

    try {
      execSync(
        `curl -sL -o "${tmpPath}" --connect-timeout 10 --max-time ${DOWNLOAD_TIMEOUT} "${videoUrl}"`,
        { timeout: (DOWNLOAD_TIMEOUT + 10) * 1000, stdio: "pipe" }
      );

      execSync(
        `ffmpeg -y -ss 00:00:01 -i "${tmpPath}" -vframes 1 -q:v 2 "${outputPath}"`,
        { timeout: EXTRACT_TIMEOUT * 1000, stdio: "pipe" }
      );

      item.ThumbnailURL = `/thumbnails/${item.id}.jpg`;
      console.log(`  done: ${outputPath}`);
    } catch (err: any) {
      const stderr = err.stderr?.toString() || "";
      const msg =
        stderr
          .split("\n")
          .filter((l: string) => l.includes("Error") || l.includes("error"))
          .slice(-2)
          .join(" | ") || err.message;
      console.error(`  failed: ${msg.slice(0, 200)}`);
    } finally {
      try {
        fs.unlinkSync(tmpPath);
      } catch {}
    }
  }

  fs.writeFileSync(METADATA_PATH, JSON.stringify(items, null, 2), "utf-8");
  console.log(`\nUpdated ${METADATA_PATH}`);
}

main();
