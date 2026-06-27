import fs from "fs";
import path from "path";

const METADATA_PATH = path.resolve("src/data/metadata.json");

function main() {
  const raw = fs.readFileSync(METADATA_PATH, "utf-8");
  const items: Item[] = JSON.parse(raw);

  const seen = new Map<string, Item>();
  const removed: Item[] = [];

  for (const item of items) {
    const key = `${item.Title}|${item.Type}|${item.Filetype}|${item.ENS}`;
    const existing = seen.get(key);
    if (existing) {
      removed.push(item);
    } else {
      seen.set(key, item);
    }
  }

  const deduped = Array.from(seen.values());

  fs.writeFileSync(METADATA_PATH, JSON.stringify(deduped, null, 2), "utf-8");

  console.log(`Before: ${items.length}`);
  console.log(`After:  ${deduped.length}`);
  console.log(`Removed: ${items.length - deduped.length}`);

  const byType = new Map<string, number>();
  for (const r of removed) {
    byType.set(r.Type, (byType.get(r.Type) || 0) + 1);
  }
  for (const [type, count] of byType) {
    console.log(`  ${type}: ${count}`);
  }
}

main();
