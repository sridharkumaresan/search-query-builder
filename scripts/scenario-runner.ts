import { readFile } from "node:fs/promises";
import { SearchQueryBuilder, pretokenizeFromCompact } from "../src/index";

const compact = JSON.parse(
  await readFile("./demo-utterances.compact.json", "utf8")
);
const pre = pretokenizeFromCompact(compact);

const stopWords = new Set([
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
const builder = new SearchQueryBuilder({
  stopWords,
  pretokenizedUtterances: pre,
  wrap: (q) => `/${q}/`,
});

const cases = [
  `how do i pre clear a trade?`,
  `how do i "pre clear trade" today`,
  `please "market on close" order vs market-on-close`,
  `"pre-clear trade" approvals during "blackout period"`,
  `how do i "pre clear trade today`,
  `rbac and abac for row level security`,
  `t plus two settlement vs t 2 settlement`,
  `blue green deployment rollback or roll back`,
];

for (const q of cases) {
  const r = builder.prepare(q);
  console.log("\nINPUT:", q);
  console.log("QUERY:", r.queryString);
  console.log("TOKENS:", r.cleanedTokens.join(" "));
  console.log("MATCHES:", r.utteranceMatches.join(" | "));
  if (r.hadUnbalancedQuotes) console.log("NOTE: unbalanced quotes detected");
}
