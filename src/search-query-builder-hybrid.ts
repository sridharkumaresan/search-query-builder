/**
 * SearchQueryBuilder (Hybrid - Lodash + Fuse.js)
 * ----------------------------------------------
 * A production-ready, future-proof text normalization and query builder utility.
 *
 * Enhancements:
 *  - Lodash simplifies array/string ops (uniq, flatMap, words, etc.)
 *  - Fuse.js provides fuzzy utterance matching (handles typos & large collections)
 *  - Works in Node, SPFx, and browser demo (via CDN)
 */

// import _ from "lodash";
// import Fuse from "fuse.js";

declare const _: any;
declare const Fuse: any;
type FuseInstance = any;

export interface PreparedQuery {
  originalInput: string;
  protectedPhrases: string[];
  cleanedTokens: string[];
  cleanedText: string;
  utteranceMatches: string[];
  queryString: string;
  hadUnbalancedQuotes: boolean;
}

export interface SearchQueryBuilderOptions {
  stopWords?: Set<string>;
  utterances?: string[];
  useUtterances?: boolean;
  wrap?: (q: string) => string;
  includeContainedMatches?: boolean;
  useBackslash?: boolean;
  fuzzyThreshold?: number; // 0 (exact) → 1 (very fuzzy)
}

/* --------------------------------------------------
   Helpers
--------------------------------------------------- */

/** Normalize smart quotes and lowercase input */
const normalize = (s: string): string =>
  _.toLower(_.trim(s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"')));

/** Split string into words */
const tokenize = (s: string): string[] =>
  _.words(normalize(s), /[a-z0-9]+(?:[-'][a-z0-9]+)*/g);

/** Quote wrapper for Graph or SharePoint-safe queries */
const createQuoteExact = (useBackslash = false) => {
  const start = useBackslash ? `\\"` : `/"`;
  const end = useBackslash ? `"\\"` : `" /`;
  return (s: string): string =>
    `${start}${s
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/'/g, "\\'")}${end}`;
};

/** Extract quoted phrases and remainder text */
const extractQuoted = (s: string): { quoted: string[]; remainder: string } => {
  const matches = Array.from(s.matchAll(/["“]([^"”]+)["”]/g), (m) =>
    normalize(m[1])
  );
  const remainder = s.replace(/["“][^"”]+["”]/g, " ");
  return { quoted: matches, remainder };
};

/** Subphrase generator (shorter n-grams) */
const getSubphrases = (arr: string[]): string[] =>
  _.flatMap(_.range(1, arr.length), (len: number) =>
    _.range(0, arr.length - len + 1).map((i: number) =>
      arr.slice(i, i + len).join(" ")
    )
  );

/** Balanced quote check */
const hasBalancedQuotes = (s: string) =>
  (s.match(/["“”]/g) || []).length % 2 === 0;

/* --------------------------------------------------
   Main Builder
--------------------------------------------------- */

export class SearchQueryBuilder {
  private stopWords: Set<string>;
  private utteranceIndex: { text: string; tokens: string[] }[];
  private wrap: (q: string) => string;
  private includeContainedMatches: boolean;
  private useBackslash: boolean;
  private useUtterances: boolean; // 👈 NEW field
  private fuse?: FuseInstance; // or: private fuse?: FuseInstance;
  private fuzzyThreshold: number; // 👈 store once

  constructor(opts: SearchQueryBuilderOptions = {}) {
    this.stopWords = opts.stopWords ?? new Set();
    const utterances = (opts.utterances ?? []).map(normalize);
    this.utteranceIndex = utterances.map((u) => ({
      text: u,
      tokens: tokenize(u),
    }));

    this.wrap = opts.wrap ?? ((q) => `/${q}/`);
    this.includeContainedMatches = !!opts.includeContainedMatches;
    this.useBackslash = !!opts.useBackslash;
    this.useUtterances = opts.useUtterances !== false; // 👈 default true
    this.fuzzyThreshold = opts.fuzzyThreshold ?? 0.3;

    // Build Fuse index only if utterances are enabled and present
    if (this.useUtterances && utterances.length) {
      this.fuse = new Fuse(utterances, {
        threshold: this.fuzzyThreshold,
        includeScore: true,
      });
    }
  }

  prepare(input: string): PreparedQuery {
    const quoteExact = createQuoteExact(this.useBackslash);
    const originalInput = input
      ? input.replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
      : "";
    if (!_.trim(originalInput)) {
      return {
        originalInput,
        protectedPhrases: [],
        cleanedTokens: [],
        cleanedText: "",
        utteranceMatches: [],
        queryString: "",
        hadUnbalancedQuotes: false,
      };
    }

    const { quoted, remainder } = extractQuoted(originalInput);
    const unified = [remainder, ...quoted].join(" ");
    const allTokens = tokenize(unified);
    const cleanedTokens = allTokens.filter((t) => !this.stopWords.has(t));
    const cleanedText = cleanedTokens.join(" ");

    // 🔎 Fuzzy utterances only if enabled
    let matches: string[] = [];
    if (this.useUtterances && this.fuse) {
      const fuseResults = this.fuse.search(cleanedText);
      // Optional: drop weak matches (e.g., > 0.5 score = <50% confidence)
      const strong = fuseResults.filter((r: any) => r.score! <= 0.5);
      matches = strong.map((r: any) => r.item);

      if (this.includeContainedMatches && matches.length) {
        const subs = _.flatMap(matches, (m: any) =>
          getSubphrases(m.split(" ")).filter((sub) =>
            this.utteranceIndex.some((u) => u.text === sub)
          )
        );
        matches = _.uniq([...matches, ...subs]);
      }
    }

    const fallbackClauses =
      _.isEmpty(matches) && cleanedTokens.length
        ? cleanedTokens.map(quoteExact)
        : [];

    // Dedup clauses + skip duplicate cleanedText if identical to original
    const maybeCleaned =
      normalize(cleanedText.trim()) !== normalize(originalInput.trim())
        ? [quoteExact(cleanedText)]
        : [];
    const clauses = _.uniq(
      _.compact([
        quoteExact(originalInput.trim()),
        ...maybeCleaned,
        ...quoted.map(quoteExact),
        ...matches.map(quoteExact),
        ...fallbackClauses,
      ])
    );

    return {
      originalInput,
      protectedPhrases: quoted,
      cleanedTokens,
      cleanedText,
      utteranceMatches: matches,
      queryString: clauses.join(" OR "),
      hadUnbalancedQuotes: !hasBalancedQuotes(originalInput),
    };
  }
}
