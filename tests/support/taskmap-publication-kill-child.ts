import { writeFileSync } from "node:fs";

import {
  publishTaskMapNativeProjection,
  type TaskMapNativePublicationInput,
  type TaskMapNativePublicationDependencies,
} from "../../src/engine/taskmap/native-refresh-service.js";
import { taskMapContractCanonicalJson } from "../../src/engine/taskmap/source-contracts.js";

interface KillChildInput {
  projectionPath: string;
  currentnessPath: string;
  journalPath: string;
  markerPath: string;
  killStage:
    | "currentness"
    | "current-work"
    | "ranking"
    | "projection"
    | "manifest"
    | "reference";
  publication: TaskMapNativePublicationInput;
}

async function stall(input: KillChildInput): Promise<void> {
  writeFileSync(input.markerPath, `${input.killStage}-durable\n`, {
    mode: 0o600,
  });
  await new Promise<void>(() => {
    setInterval(() => {}, 1_000);
  });
}

async function main(): Promise<void> {
  const encoded = process.argv[2];
  if (encoded === undefined) throw new Error("missing publication input");
  const input = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  ) as KillChildInput;
  const prettyWrite = async (
    directory: string,
    filename: string,
    value: unknown,
  ): Promise<void> => {
    writeFileSync(
      `${directory}/${filename}`,
      `${JSON.stringify(value, null, 2)}\n`,
      { mode: 0o600 },
    );
    await stall(input);
  };
  const canonicalWrite = async (
    directory: string,
    filename: string,
    value: unknown,
  ): Promise<void> => {
    writeFileSync(
      `${directory}/${filename}`,
      taskMapContractCanonicalJson(value),
      { mode: 0o600 },
    );
    await stall(input);
  };
  const dependencies: TaskMapNativePublicationDependencies =
    input.killStage === "currentness"
      ? { writeCurrentness: prettyWrite }
      : input.killStage === "current-work"
      ? { writeCurrentWork: canonicalWrite }
      : input.killStage === "ranking"
      ? { writeRanking: canonicalWrite }
      : input.killStage === "projection"
      ? {
          writeProjection: async () => stall(input),
        }
      : input.killStage === "manifest"
      ? { writeGenerationManifest: canonicalWrite }
      : { writeGenerationReference: canonicalWrite };
  await publishTaskMapNativeProjection(
    input.projectionPath,
    input.currentnessPath,
    input.journalPath,
    input.publication,
    dependencies,
  );
}

void main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
