import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { SearchQueryBuilder, pretokenizeFromCompact } from "../src/index";

const STOP_WORDS = new Set([
  "how",
  "do",
  "i",
  "a",
  "the",
  "and",
  "or",
  "to",
  "of",
  "in",
  "is",
  "are",
  "for",
  "with",
  "on",
  "at",
  "by",
  "from",
]);

function hr(ms: number) {
  return `${ms.toFixed(2)} ms`;
}
function makeInput(tokens: string[], total: number, stops: string[] = []) {
  const out = [];
  for (let i = 0; i < total; i++)
    out.push(
      i % 9 === 0 && stops.length
        ? stops[i % stops.length]
        : tokens[i % tokens.length]
    );
  return out.join(" ");
}

const compact = JSON.parse(
  await readFile("./demo-utterances.compact.json", "utf8")
);
const pre = pretokenizeFromCompact(compact);

let t0 = performance.now();
const builder = new SearchQueryBuilder({
  stopWords: STOP_WORDS,
  pretokenizedUtterances: pre,
  wrap: (q) => `/${q}/`,
});
let buildMs = performance.now() - t0;
console.log(
  `AC build: ${hr(buildMs)} (phrases=${pre.length}, dict=${compact.dict.length})`
);

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
];
const stops = ["the", "and", "to", "of", "in", "is", "are"];
for (const N of [50, 200, 800, 1600, 4000]) {
  const input = makeInput(vocab, N, stops);
  builder.prepare("warm up");
  t0 = performance.now();
  const r = builder.prepare(input);
  const dt = performance.now() - t0;
  console.log(
    `N=${String(N).padStart(4)} tokens -> ${hr(dt)} | clauses=${r.queryString ? r.queryString.split(" OR ").length : 0}`
  );
}
