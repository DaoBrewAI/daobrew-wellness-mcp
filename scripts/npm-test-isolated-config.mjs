import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const includeRequiredSuitesFlag = "--include-required-suites";
const requiredNormalTestSuites = ["dist/tests/taskmap-showcase.test.js"];

export function normalTestNodeArguments(nodeArguments) {
  if (!nodeArguments.includes(includeRequiredSuitesFlag)) {
    return [...nodeArguments];
  }
  const requiredSuites = new Set(requiredNormalTestSuites);
  return [
    ...nodeArguments.filter((argument) => (
      argument !== includeRequiredSuitesFlag
      && !requiredSuites.has(argument)
    )),
    ...requiredNormalTestSuites,
  ];
}

export function runNodeWithIsolatedConfig(nodeArguments, options = {}) {
  const temporaryParent = options.temporaryParent ?? tmpdir();
  const configDirectory = mkdtempSync(path.join(temporaryParent, "daobrew-npm-test-"));
  const configFile = path.join(configDirectory, "daobrew-test-config.json");
  let result;
  try {
    chmodSync(configDirectory, 0o700);
    result = spawnSync(process.execPath, nodeArguments, {
      encoding: "utf8",
      stdio: options.stdio ?? "pipe",
      env: {
        ...process.env,
        ...(options.env ?? {}),
        DAOBREW_CONFIG_FILE: configFile,
      },
    });
  } finally {
    rmSync(configDirectory, { recursive: true, force: true });
  }
  return {
    ...result,
    configDirectory,
    configFile,
  };
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const result = runNodeWithIsolatedConfig(
    normalTestNodeArguments(process.argv.slice(2)),
    { stdio: "inherit" },
  );
  if (result.error) {
    console.error(result.error.message);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
}
