import { SearchQueryBuilder } from "../src/index";

const stopWords = new Set([
  "how",
  "do",
  "i",
  "a",
  "the",
  "and",
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
const utterances = [
  "pre clear",
  "trade",
  "pre clear trade",
  "insider trading",
  "limit order",
  "annual report",
  "market-on-close",
  "market on close",
  "rbac",
  "abac",
  "row level security",
];

const builder = new SearchQueryBuilder({
  stopWords,
  utterances, // for prod prefer pretokenized or compact artifact path
  wrap: (q) => `/${q}/`,
});

const inputs = [
  "how do i pre clear a trade?",
  'how do i "pre clear trade" today',
  `please "market on close" order vs market-on-close`,
  `rbac and abac for row level security`,
  `how do i "pre clear trade today`,
];

for (const s of inputs) {
  const r = builder.prepare(s);
  console.log("\nINPUT :", s);
  console.log("QUERY :", r.queryString);
  console.log("TOKENS:", r.cleanedTokens.join(" "));
  console.log("MATCH :", r.utteranceMatches.join(" | "));
  if (r.hadUnbalancedQuotes) console.log("NOTE  : unbalanced quotes detected");
}
