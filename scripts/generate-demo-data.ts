import { writeFile } from "node:fs/promises";

type GenOpts = {
  count: number;
  minLen: number;
  maxLen: number;
  vocab: string[];
  separator?: string;
};
function synthesize(opts: GenOpts) {
  const sep = opts.separator ?? " ";
  const utter: string[] = [];
  for (let i = 0; i < opts.count; i++) {
    const len = opts.minLen + (i % (opts.maxLen - opts.minLen + 1));
    const tokens = Array.from(
      { length: len },
      (_, j) => opts.vocab[(i * 131 + j * 997) % opts.vocab.length]
    );
    utter.push(tokens.join(sep));
  }
  return utter;
}
function toCompact(phrases: string[]) {
  const dict: string[] = [];
  const idx = new Map<string, number>();
  const out: number[][] = [];
  for (const p of phrases) {
    const toks = p.trim().split(/\s+/g);
    const ids: number[] = [];
    for (const t of toks) {
      if (!idx.has(t)) {
        idx.set(t, dict.length);
        dict.push(t);
      }
      ids.push(idx.get(t)!);
    }
    out.push(ids);
  }
  return { dict, phrases: out };
}

async function main() {
  const vocab = [
    "pre",
    "clear",
    "trade",
    "limit",
    "order",
    "approval",
    "annual",
    "report",
    "market",
    "close",
    "risk",
    "breach",
    "rbac",
    "abac",
    "row",
    "level",
    "security",
    "delta",
    "lake",
    "data",
    "scd",
    "two",
  ];
  const utterances = synthesize({ count: 10000, minLen: 2, maxLen: 4, vocab });
  await writeFile("./demo-utterances.csv", utterances.join(","), "utf8");
  const compact = toCompact(utterances);
  await writeFile(
    "./demo-utterances.compact.json",
    JSON.stringify({ version: 1, ...compact }),
    "utf8"
  );
  console.log("Wrote demo-utterances.csv and demo-utterances.compact.json");
}
main().catch((e) => (console.error(e), process.exit(1)));
