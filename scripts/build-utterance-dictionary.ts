import fs from "fs";
import { parse } from "csv-parse/sync";

// --- CONFIG ---
const INPUT_CSV = "data/data-utterances.csv"; // your SharePoint dump
const OUTPUT_JSON = "dist/artifacts/utterances.compact.json";

// --- READ CSV ---
const raw = fs.readFileSync(INPUT_CSV, "utf8");
const records = parse(raw, {
  columns: true, // detect header
  skip_empty_lines: true,
});

// --- EXTRACT PHRASES ---
const phrases = records
  .map((r) => (r.utterance || Object.values(r)[0]).trim().toLowerCase())
  .filter(Boolean)
  .map((p) => p.split(/\s+/));

// --- BUILD DICTIONARY ---
const dict = Array.from(new Set(phrases.flat()));
const dictIndex = Object.fromEntries(dict.map((t, i) => [t, i]));
const phraseIndexes = phrases.map((tokens) => tokens.map((t) => dictIndex[t]));

// --- CREATE ARTIFACT ---
const artifact = {
  version: 1,
  generated: new Date().toISOString(),
  count: phrases.length,
  dict,
  phrases: phraseIndexes,
};

// --- SAVE ---
fs.mkdirSync("./dist/artifacts", { recursive: true });
fs.writeFileSync(OUTPUT_JSON, JSON.stringify(artifact, null, 2));
console.log(`✅ Created ${OUTPUT_JSON} with ${artifact.count} utterances`);
