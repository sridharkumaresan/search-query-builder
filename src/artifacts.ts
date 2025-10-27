export type CompactArtifact = {
  version: number;
  dict: string[]; // normalized tokens
  phrases: number[][]; // arrays of token indexes into dict
};

/** Expand compact artifact to pretokenized utterances (string[][]). */
export function pretokenizeFromCompact(art: CompactArtifact): string[][] {
  const out: string[][] = [];
  for (const idxs of art.phrases) out.push(idxs.map((i) => art.dict[i]));
  return out;
}

/** Hydration type for a precompiled automaton (advanced/optional). */
export type HydratedAC = {
  next: Array<Record<string, number>>;
  fail: number[];
  out: number[][];
  phrases: string[];
  pLens: number[];
};

/**
 * Hydrate a precompiled automaton. This returns an object compatible with
 * the SearchQueryBuilder's internal AC layout and should be passed via `acOverride`.
 * Consumers should not call methods on this object directly.
 */
export function hydrateAC(h: HydratedAC): any /* TokenAC-like */ {
  const ac = Object.create(null);
  (ac as any).next = h.next;
  (ac as any).fail = h.fail;
  (ac as any).out = h.out;
  (ac as any).phrases = h.phrases;
  (ac as any).pLens = h.pLens;
  (ac as any).tokenize = (s: string) => s.split(" ");
  return ac;
}
