import { hy } from "../src/index";


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
  "do",
  "i",
  "need",
  "to",
  "as",
  "a",
  "are",
  "for",
  "how",
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
  "personal trading account",
  "trading account",
  "account",
  "ira",
];

// Create builder instance
const builder = new hy.SearchQueryBuilder({
  stopWords,
  utterances,
  includeContainedMatches: true,
  fuzzyThreshold: 0.3, // adjust for fuzziness
});


const inputs = [
  "how do i pre clear a trade?",
  'how do i "pre clear trade" today',
  'how do i "pre clear trade" today, account today preclear today preclr?',
  // `please "market on close" order vs market-on-close`,
  // `rbac and abac for row level security`,
  // `how do i "pre clear trade today`,
  `Do I need to disclose 'my roth for how IRA' as a "personal are trading account"`,
  "Sridhar Kumaresan wants trading accounts for his personal trading account and IRA",
  "Sridhar Kumaresan",
];

for (const s of inputs) {
  const r = builder.prepare(s);
  console.log("INPUT :", r.originalInput);
  console.log("TOKENS:", r.cleanedTokens.join(" | "));
  console.log("PROTECTED:", r.protectedPhrases);
  console.log("MATCHES:", r.utteranceMatches);
  console.log("QUERY :", r.queryString);
  if (r.hadUnbalancedQuotes) console.log("NOTE  : unbalanced quotes detected");
}