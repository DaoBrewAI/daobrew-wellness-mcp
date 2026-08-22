import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { transcriptSpans } from "./backfill-granola-transcripts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("transcript parsing derives arbitrary speaker labels from the document", () => {
  assert.deepEqual(
    transcriptSpans(
      "Avery Chen: The delivery receipt needs a stable citation.  "
      + "Participant 2: I will verify the published artifact before review.",
    ),
    [
      {
        idx: 0,
        speaker: "Avery Chen",
        ts_offset_sec: null,
        text: "The delivery receipt needs a stable citation.",
      },
      {
        idx: 1,
        speaker: "Participant 2",
        ts_offset_sec: null,
        text: "I will verify the published artifact before review.",
      },
    ],
  );
});

test("production backfill source contains no fixed participant allowlist", () => {
  const source = readFileSync(
    path.join(root, "scripts", "backfill-granola-transcripts.mjs"),
    "utf8",
  );
  assert.doesNotMatch(source, /Neo|Linhan|Yiming/);
});
