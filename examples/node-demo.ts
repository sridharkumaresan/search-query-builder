import { SearchQueryBuilder } from "../src/index";
import utterancesCompactJson from '../dist/artifacts/utterances.compact.json' assert { type: "json" };

// helper function
function expandCompactArtifact(artifact: { dict: string[], phrases: number[][] }) {
  return artifact.phrases.map(indices => indices.map(i => artifact.dict[i]).join(' '));
}

const expandedUtterances = expandCompactArtifact(utterancesCompactJson);

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

const builder = new SearchQueryBuilder({
  stopWords,
  utterances: expandedUtterances,
  // utterances, // for prod prefer pretokenized or compact artifact path
  wrap: (q) => `/${q}/`,
  includeContainedMatches: true,
  useBackslash: true,
  useUtterances: false,
});

const inputs = [
  "how do i pre clear a trade?",
  'how do i "pre clear trade" today, account today preclear today preclr?',
  // `please "market on close" order vs market-on-close`,
  // `rbac and abac for row level security`,
  // `how do i "pre clear trade today`,
  `Do I need to disclose 'my roth for how IRA' as a "personal are trading account"`,
  "Sridhar Kumaresan wants trading accounts for his personal trading account and IRA",
  "Sridhar Kumaresan pre clearance approval equity holding",
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
