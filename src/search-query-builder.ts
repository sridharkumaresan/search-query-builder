/* eslint-disable @typescript-eslint/consistent-type-definitions */

/**
 * High-performance free-text → OR-joined query builder.
 * - Balanced quotes preserved as-is (straight " and curly “ ”).
 * - Unbalanced quotes: no phrase extraction; strip stray quotes for tokenization; include exact clause.
 * - Stop-words removed from unquoted remainder only.
 * - Aho–Corasick (token-level) for utterance matching; O(n + matches).
 * - Output: whole-phrase, double-quoted clauses, slash-wrapped by default, OR-joined.
 * - Extensible: normalize, tokenize, wrap, pretokenized utterances, precompiled automaton.
 */

export type NormalizeFn = (s: string) => string;
export type TokenizeFn = (s: string) => string[];

export type PrepareQueryOptions = {
  stopWords: ReadonlySet<string>;
  utterances?: string[]; // classic path
  pretokenizedUtterances?: string[][]; // fast path: already normalized tokens/phrases
  normalize?: NormalizeFn; // default: NFKC+lower+trim
  tokenize?: TokenizeFn; // default: regex tokenizer over normalized text
  wrap?: (quoted: string) => string; // default: q => `/${q}/`
  alwaysIncludeCleaned?: boolean; // include cleaned even if equals normalized original
  acOverride?: TokenAC; // fastest: precompiled automaton (hydrated)
};

export type PreparedQuery = {
  originalInput: string;
  protectedPhrases: string[];
  cleanedTokens: string[];
  cleanedText: string;
  utteranceMatches: string[]; // longest-per-start, unique, sorted length-desc then lex
  queryString: string; // e.g., /"…"/ OR /"…"/
  hadUnbalancedQuotes: boolean;
};

const DEFAULT_TOKEN_REGEX = /[a-z0-9]+(?:[-'][a-z0-9]+)*/gi;

const defaultNormalize: NormalizeFn = (s) =>
  s.normalize("NFKC").toLowerCase().trim();

const defaultTokenize: TokenizeFn = (s) => {
  const out: string[] = [];
  const re = new RegExp(DEFAULT_TOKEN_REGEX.source, DEFAULT_TOKEN_REGEX.flags);
  const n = defaultNormalize(s);
  let m: RegExpExecArray | null;
  while ((m = re.exec(n))) out.push(m[0]);
  return out;
};

const defaultWrap = (q: string) => `/${q}/`;

/** Quote + escape inner backslashes and quotes */
function quoteExact(phrase: string): string {
  const escaped = phrase.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/* ----------------------- Quote utilities ----------------------- */

function hasBalancedStraightQuotes(s: string): boolean {
  let count = 0;
  for (let i = 0; i < s.length; i++)
    if (s[i] === '"' && s[i - 1] !== "\\") count++;
  return count % 2 === 0;
}

function hasBalancedCurlyQuotes(s: string): boolean {
  const opens = (s.match(/“/g) || []).length;
  const closes = (s.match(/”/g) || []).length;
  return opens === closes;
}

function extractQuotedPhrasesBalanced(input: string): {
  protected: string[];
  remainder: string;
} {
  const protectedPhrases: string[] = [];
  let remainder = "";
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    const startStraight = ch === '"';
    const startCurly = ch === "“";
    if (startStraight || startCurly) {
      const endChar = startStraight ? '"' : "”";
      let j = i + 1,
        found = -1;
      while (j < input.length) {
        if (input[j] === endChar && input[j - 1] !== "\\") {
          found = j;
          break;
        }
        j++;
      }
      if (found > i) {
        const inside = input.slice(i + 1, found);
        if (inside.trim()) protectedPhrases.push(inside);
        i = found + 1;
        continue;
      }
    }
    remainder += input[i];
    i++;
  }
  return { protected: protectedPhrases, remainder: remainder.trim() };
}

function stripStrayQuotes(s: string): string {
  return s.replace(/["“”]/g, " ").replace(/\s+/g, " ").trim();
}

/* ---------------- Token Aho–Corasick over token sequences ---------------- */

class TokenAC {
  private next: Array<Record<string, number>> = [Object.create(null)];
  private fail: number[] = [0];
  private out: number[][] = [[]];
  private phrases: string[] = [];
  private pLens: number[] = [];
  constructor(private tokenize: TokenizeFn) {}

  addPhrase(raw: string) {
    const tokens = this.tokenize(raw);
    this.addTokens(tokens);
  }

  /** Fast path: insert pretokenized (normalized) phrase tokens */
  addTokens(tokens: string[]) {
    if (!tokens.length) return;
    let node = 0;
    for (const t of tokens) {
      const child = this.next[node][t];
      if (child == null) {
        const id = this.next.length;
        this.next[node][t] = id;
        this.next.push(Object.create(null));
        this.fail.push(0);
        this.out.push([]);
        node = id;
      } else {
        node = child;
      }
    }
    const str = tokens.join(" ");
    if (!this.out[node].some((pid) => this.phrases[pid] === str)) {
      const id = this.phrases.length;
      this.phrases.push(str);
      this.pLens.push(tokens.length);
      this.out[node].push(id);
    }
  }

  build() {
    const q: number[] = [];
    for (const k of Object.keys(this.next[0])) {
      const c = this.next[0][k];
      if (c !== 0) {
        this.fail[c] = 0;
        q.push(c);
      }
    }
    while (q.length) {
      const v = q.shift()!;
      const f = this.fail[v];
      if (this.out[f]?.length) this.out[v].push(...this.out[f]);
      for (const k of Object.keys(this.next[v])) {
        const u = this.next[v][k];
        q.push(u);
        let j = this.fail[v];
        while (j !== 0 && this.next[j][k] == null) j = this.fail[j];
        this.fail[u] = this.next[j][k] ?? 0;
      }
    }
  }

  /** O(n + matches). Longest-per-start; unique; length-desc then lex order. */
  findAll(tokens: string[]): string[] {
    if (this.next.length === 1) return [];
    let state = 0;
    const best = new Map<number, { end: number; phrase: string }>();

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      while (state !== 0 && this.next[state][tok] == null)
        state = this.fail[state];
      const ns = this.next[state][tok];
      state = ns == null ? 0 : ns;

      const outs = this.out[state];
      if (outs && outs.length) {
        for (const pid of outs) {
          const len = this.pLens[pid];
          const start = i - len + 1;
          if (start >= 0) {
            const phrase = this.phrases[pid];
            const prev = best.get(start);
            if (!prev || i > prev.end) best.set(start, { end: i, phrase });
          }
        }
      }
    }

    const selected = Array.from(best.values()).map((v) => v.phrase);
    const unique = Array.from(new Set(selected));
    unique.sort((a, b) => b.length - a.length || a.localeCompare(b));
    return unique;
  }
}

export class SearchQueryBuilder {
  private readonly stopWords: ReadonlySet<string>;
  private readonly normalize: NormalizeFn;
  private readonly tokenize: TokenizeFn;
  private readonly wrap: (quoted: string) => string;
  private readonly alwaysIncludeCleaned: boolean;
  private readonly ac: TokenAC;

  constructor(opts: PrepareQueryOptions) {
    this.stopWords = opts.stopWords ?? new Set();
    this.normalize = opts.normalize ?? defaultNormalize;
    this.tokenize = opts.tokenize ?? defaultTokenize;
    this.wrap = opts.wrap ?? defaultWrap;
    this.alwaysIncludeCleaned = !!opts.alwaysIncludeCleaned;

    if (opts.acOverride) {
      this.ac = opts.acOverride;
    } else {
      this.ac = new TokenAC(this.tokenize);
      if (opts.pretokenizedUtterances?.length) {
        for (const toks of opts.pretokenizedUtterances) this.ac.addTokens(toks);
      } else if (opts.utterances?.length) {
        for (const u of opts.utterances) this.ac.addPhrase(u);
      }
      this.ac.build();
    }
  }

  prepare(userInput: string): PreparedQuery {
    const originalInput = (userInput ?? "").toString();
    const trimmed = originalInput.trim();
    if (!trimmed) {
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

    const straightBalanced = hasBalancedStraightQuotes(originalInput);
    const curlyBalanced = hasBalancedCurlyQuotes(originalInput);
    const quotesBalanced = straightBalanced && curlyBalanced;

    let protectedPhrases: string[] = [];
    let remainder = "";

    if (quotesBalanced) {
      const { protected: prot, remainder: rem } =
        extractQuotedPhrasesBalanced(originalInput);
      protectedPhrases = prot.map((p) => p.trim()).filter(Boolean);
      remainder = rem;
    } else {
      remainder = stripStrayQuotes(originalInput);
    }

    const remainderTokens = this.tokenize(remainder);
    const cleanedTokens = this.stopWords.size
      ? remainderTokens.filter((t) => !this.stopWords.has(t))
      : remainderTokens;
    const cleanedText = cleanedTokens.join(" ").trim();

    const utteranceMatches = this.ac.findAll(cleanedTokens);

    const clauses: string[] = [];
    clauses.push(quoteExact(trimmed));

    const normOriginal = this.normalize(originalInput);
    if (
      cleanedText &&
      (this.alwaysIncludeCleaned || cleanedText !== normOriginal)
    ) {
      clauses.push(quoteExact(cleanedText));
    }
    if (quotesBalanced && protectedPhrases.length) {
      for (const p of protectedPhrases) clauses.push(quoteExact(p));
    }
    for (const m of utteranceMatches) clauses.push(quoteExact(m));

    const seen = new Set<string>();
    const ordered = clauses.filter((c) =>
      seen.has(c) ? false : (seen.add(c), true)
    );
    const queryString = ordered.map(this.wrap).join(" OR ");

    return {
      originalInput,
      protectedPhrases,
      cleanedTokens,
      cleanedText,
      utteranceMatches,
      queryString,
      hadUnbalancedQuotes: !quotesBalanced,
    };
  }
}
