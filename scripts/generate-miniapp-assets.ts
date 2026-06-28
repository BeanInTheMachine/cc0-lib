import { readFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";

const PUBLIC = join(process.cwd(), "public");
const BG = "#18181b";

const markSvg = readFileSync(join(PUBLIC, "cc0lib-c.svg"));
const wordSvg = readFileSync(join(PUBLIC, "cc0lib-h.svg"));

async function renderSquare(svg: Buffer, size: number) {
  return sharp(svg, { density: 384 }).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

async function renderWidth(svg: Buffer, width: number) {
  return sharp(svg, { density: 384 }).resize({ width }).png().toBuffer();
}

async function background(width: number, height: number) {
  return sharp({ create: { width, height, channels: 4, background: BG } });
}

async function generateIcon() {
  const markSize = 880;
  const mark = await renderSquare(markSvg, markSize);
  const offset = Math.round((1024 - markSize) / 2);
  const out = await (await background(1024, 1024))
    .composite([{ input: mark, top: offset, left: offset }])
    .flatten({ background: BG })
    .png()
    .toBuffer();
  await sharp(out).removeAlpha().toFile(join(PUBLIC, "miniapp-icon.png"));
}

async function generateSplash() {
  const mark = await renderSquare(markSvg, 200);
  await sharp(mark).toFile(join(PUBLIC, "miniapp-splash.png"));
}

async function generateCard(width: number, height: number, file: string, markSize: number, wordWidth: number) {
  const mark = await renderSquare(markSvg, markSize);
  const word = await renderWidth(wordSvg, wordWidth);
  const wordHeight = Math.round((wordWidth * 49) / 394);
  const gap = Math.round(markSize * 0.15);
  const blockHeight = markSize + gap + wordHeight;
  const markTop = Math.round((height - blockHeight) / 2);
  const markLeft = Math.round((width - markSize) / 2);
  const wordTop = markTop + markSize + gap;
  const wordLeft = Math.round((width - wordWidth) / 2);
  await (await background(width, height))
    .composite([
      { input: mark, top: markTop, left: markLeft },
      { input: word, top: wordTop, left: wordLeft },
    ])
    .flatten({ background: BG })
    .png()
    .toFile(join(PUBLIC, file));
}

async function main() {
  await generateIcon();
  await generateSplash();
  await generateCard(1200, 800, "miniapp-embed.png", 340, 560);
  await generateCard(1200, 630, "miniapp-hero.png", 260, 520);
  console.log("Generated: miniapp-icon.png, miniapp-splash.png, miniapp-embed.png, miniapp-hero.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
