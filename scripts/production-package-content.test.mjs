import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryOutputRoot = path.join(root, "build", "production-package-test");
const developmentNodeModules = path.join(root, "node_modules");

function isPathWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === ""
    || (!relative.startsWith(`..${path.sep}`)
      && relative !== ".."
      && !path.isAbsolute(relative));
}

function withTemporaryPackageWorkspace(operation) {
  const outputRoot = mkdtempSync(path.join(tmpdir(), "daobrew-production-package-test-"));
  try {
    chmodSync(outputRoot, 0o700);
    assert.equal(
      isPathWithin(realpathSync(root), realpathSync(outputRoot)),
      false,
      "package acceptance workspace must be outside the development package",
    );
    return operation({
      outputRoot,
      npmCache: path.join(outputRoot, "npm-cache"),
    });
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
}

function run(command, args, npmCache, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: npmCache },
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout;
}

function inventoryFromDryRun(npmCache) {
  const output = run("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], npmCache);
  const parsed = JSON.parse(output);
  assert.equal(parsed.length, 1);
  return parsed[0].files.map(({ path: filePath }) => filePath).sort();
}

function assertProductionInventory(files) {
  assert.ok(files.length > 0);
  for (const filePath of files) {
    assert.equal(path.isAbsolute(filePath), false, filePath);
    assert.equal(filePath.includes(".."), false, filePath);
    assert.doesNotMatch(
      filePath,
      /(^|\/)(?:tests?|__tests__|fixtures?|evidence)(?:\/|$)/i,
      filePath,
    );
    assert.doesNotMatch(
      filePath,
      /(?:showcase|wednesday-demo|taskmap-demo|seed(?:[-_.]|$))/i,
      filePath,
    );
    assert.doesNotMatch(
      filePath,
      /(^|\/)(?:mock|development-tools)\.(?:js|d\.ts)$/i,
      filePath,
    );
    assert.doesNotMatch(
      filePath,
      /(?:^|\/)(?:\.env(?:\..*)?|config\.json|credentials?\.json|tokens?\.json|.+\.(?:db|sqlite|sqlite3))(?:$|[._-])/i,
      filePath,
    );
  }
  const metadata = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const entrypoints = new Set([
    metadata.main,
    ...Object.values(metadata.bin),
  ]);
  for (const entrypoint of entrypoints) {
    assert.ok(files.includes(entrypoint), `missing package entrypoint: ${entrypoint}`);
  }
  assert.ok(
    files.includes("prompts/mention-extraction-v1.md"),
    "production package must include the bounded meeting-extraction prompt",
  );
  assert.ok(
    files.includes("prompts/agent-session-extraction-v1.md"),
    "production package must include the bounded agent-session extraction prompt",
  );
  assert.ok(
    files.includes("prompts/calendar-extraction-v1.md"),
    "production package must include the bounded calendar extraction prompt",
  );
  assert.ok(
    files.includes("prompts/community-task-extraction-v1.md"),
    "production package must include the bounded community task extraction prompt",
  );
  for (const moduleName of [
    "agent-session-refresh-llm-replay",
    "calendar-refresh-llm-replay",
    "agent-session-extraction",
    "calendar-extraction",
    "calendar-candidate-adapter",
    "gemini-remote",
    "identity-adjudication-proposal",
    "identity-adjudication-refresh",
    "llm-proposal-surface",
    "llm-station",
    "method-library",
    "decomposition-validation",
    "decomposition-refresh",
  ]) {
    const modulePath = `dist/src/engine/taskmap/${moduleName}.js`;
    assert.ok(
      files.includes(modulePath),
      `production package must include ${modulePath}`,
    );
  }
  assert.ok(
    files.includes("dist/src/engine/embeddings/gemini-remote.js"),
    "production package must include the remote Gemini embedding adapter",
  );

  const codeBuiltStationModules = [
    "dist/src/engine/taskmap/identity-adjudication-proposal.js",
    "dist/src/engine/taskmap/method-library.js",
  ];
  for (const modulePath of codeBuiltStationModules) {
    const source = readFileSync(path.join(root, modulePath), "utf8");
    assert.doesNotMatch(
      source,
      /promptTemplatePath/,
      `${modulePath} must keep its prompt code-built`,
    );
  }
  assert.deepEqual(
    files.filter((filePath) => filePath.startsWith("prompts/")),
    [
      "prompts/agent-session-extraction-v1.md",
      "prompts/calendar-extraction-v1.md",
      "prompts/community-task-extraction-v1.md",
      "prompts/mention-extraction-v1.md",
    ],
    "the runtime prompt inventory must remain exact and bounded",
  );
}

function walkFiles(directory, prefix = "") {
  const result = [];
  for (const name of readdirSync(directory).sort()) {
    const absolute = path.join(directory, name);
    const relative = path.join(prefix, name);
    const metadata = lstatSync(absolute);
    assert.equal(metadata.isSymbolicLink(), false, relative);
    if (metadata.isDirectory()) result.push(...walkFiles(absolute, relative));
    else if (metadata.isFile()) result.push(relative);
    else assert.fail(`unsupported package entry: ${relative}`);
  }
  return result;
}

function assertNoPrivateContent(packageRoot, files) {
  const textFile = /\.(?:c?js|mjs|json|md|txt|d\.ts|sh)$/i;
  const forbidden = [
    /\/(?:Users|home)\/[A-Za-z0-9._-]+\//,
    /\.orchestrator\/missions|aug6-taskmap-productionization/i,
    /taskmap-showcase|showcase-source|wednesday-demo|DEMO_USER_ID/i,
    /reviewer-alpha-unversioned|--moonshot-local|DAOBREW_TASKMAP_SHOWCASE/i,
    /--demo|--mock|mock[_ -]mode|seed-demo|DAOBREW_MOCK/i,
    /ghost_ai2_demo_story|ai2_demo_story|AI2 demo readiness/i,
    /DaoBrewAI\/DaoBrewStrategy|founder-Mac witness/i,
    /(?:Neo|Linhan|Yiming)(?=[|,:)])/i,
    /dbd_[A-Za-z0-9_-]{16,}/i,
    /ya29\.[A-Za-z0-9._-]{20,}/i,
    /1\/\/[A-Za-z0-9._-]{20,}/i,
  ];
  for (const filePath of files.filter((item) => textFile.test(item))) {
    const bytes = readFileSync(path.join(packageRoot, filePath));
    if (bytes.length > 8 * 1024 * 1024 || bytes.includes(0)) continue;
    const text = bytes.toString("utf8");
    for (const pattern of forbidden) {
      // D-95 keeps main's explicitly gated demo/mock behavior in the three
      // required runtime entrypoints. The production inventory still excludes
      // every development/showcase module and script; these entrypoints merely
      // retain the opt-in compatibility seam and never expose it as a
      // production tool definition.
      if (
        new Set([
          "dist/src/engine/run.js",
          "dist/src/index.js",
          "dist/src/tools.js",
        ]).has(filePath)
        && (
          pattern.source.includes("taskmap-showcase")
          || pattern.source.includes("--demo")
        )
      ) continue;
      if (
        filePath === "package.json"
        && pattern.source.includes("--demo")
      ) continue;
      if (
        pattern.source.startsWith("1\\/\\/")
        && text.includes("data:image/png;base64,")
      ) continue;
      assert.doesNotMatch(text, pattern, `${pattern} in ${filePath}`);
    }
  }
}

function lockedProductionDependencyDirectories(packageMetadata) {
  const lock = JSON.parse(readFileSync(path.join(root, "package-lock.json"), "utf8"));
  assert.equal(lock.lockfileVersion, 3, "production install requires lockfile v3");
  assert.equal(typeof lock.packages, "object");
  assert.notEqual(lock.packages, null);
  const rootLock = lock.packages[""];
  assert.equal(typeof rootLock, "object");
  assert.notEqual(rootLock, null);
  assert.equal(rootLock.name, packageMetadata.name);
  assert.equal(rootLock.version, packageMetadata.version);
  assert.deepEqual(
    rootLock.dependencies ?? {},
    packageMetadata.dependencies ?? {},
    "packed dependencies must equal the locked production roots",
  );

  const seenIdentities = new Set();
  const directories = [];
  for (const [lockPath, locked] of Object.entries(lock.packages).sort()) {
    if (!lockPath.startsWith("node_modules/") || locked.dev === true) continue;
    const absolute = path.join(root, ...lockPath.split("/"));
    const filesystemMetadata = lstatSync(absolute);
    assert.equal(filesystemMetadata.isSymbolicLink(), false, lockPath);
    assert.equal(filesystemMetadata.isDirectory(), true, lockPath);
    assert.equal(
      isPathWithin(realpathSync(developmentNodeModules), realpathSync(absolute)),
      true,
      lockPath,
    );
    const installedMetadata = JSON.parse(readFileSync(
      path.join(absolute, "package.json"),
      "utf8",
    ));
    const expectedName = lockPath.slice(lockPath.lastIndexOf("node_modules/") + 13);
    assert.equal(installedMetadata.name, expectedName, lockPath);
    assert.equal(installedMetadata.version, locked.version, lockPath);
    const identity = `${installedMetadata.name}@${installedMetadata.version}`;
    assert.equal(seenIdentities.has(identity), false, `duplicate production package: ${identity}`);
    seenIdentities.add(identity);
    directories.push(absolute);
  }
  assert.ok(directories.length > 0, "production dependency closure must not be empty");
  return directories;
}

function packProductionDependencies(directories, destination, npmCache) {
  mkdirSync(destination, { mode: 0o700 });
  const packed = JSON.parse(run("npm", [
    "pack",
    ...directories,
    "--json",
    "--ignore-scripts",
    "--pack-destination",
    destination,
  ], npmCache));
  assert.equal(packed.length, directories.length);
  const tarballs = packed.map(({ filename }) => {
    assert.equal(path.basename(filename), filename);
    const tarball = path.join(destination, filename);
    const metadata = lstatSync(tarball);
    assert.equal(metadata.isSymbolicLink(), false, filename);
    assert.equal(metadata.isFile(), true, filename);
    return tarball;
  }).sort();
  assert.equal(new Set(tarballs).size, tarballs.length);
  return tarballs;
}

function installedPackagePath(installRoot, packageName) {
  const components = packageName.split("/");
  assert.ok(
    components.length === 1
      || (components.length === 2 && components[0].startsWith("@")),
    `unsupported package name: ${packageName}`,
  );
  for (const component of components) {
    assert.ok(component.length > 0 && component !== "." && component !== "..");
    assert.equal(component.includes(path.sep), false);
  }
  return path.join(installRoot, "node_modules", ...components);
}

const hermeticImportProbe = `
  const assert = require("node:assert/strict");
  const fs = require("node:fs");
  const Module = require("node:module");
  const path = require("node:path");
  const [allowedArgument, forbiddenArgument, ...entries] = process.argv.slice(1);
  const allowedRoot = fs.realpathSync(allowedArgument);
  const forbiddenRoot = fs.realpathSync(forbiddenArgument);
  const isWithin = (parent, candidate) => {
    const relative = path.relative(parent, candidate);
    return relative === ""
      || (!relative.startsWith(".." + path.sep)
        && relative !== ".."
        && !path.isAbsolute(relative));
  };
  const originalNodeModulePaths = Module._nodeModulePaths;
  Module._nodeModulePaths = (from) => originalNodeModulePaths(from)
    .filter((candidate) => isWithin(allowedRoot, path.resolve(candidate)));
  Module.globalPaths.splice(0);
  assert.throws(
    () => require.resolve("typescript", { paths: [path.dirname(entries[0])] }),
    (error) => error && error.code === "MODULE_NOT_FOUND",
    "development-only TypeScript must not be resolvable",
  );
  for (const entry of entries) require(path.resolve(entry));
  for (const loaded of Object.keys(require.cache)) {
    const canonical = fs.realpathSync(loaded);
    assert.equal(isWithin(allowedRoot, canonical), true, canonical);
    assert.equal(isWithin(forbiddenRoot, canonical), false, canonical);
  }
`;

test("actual npm package is a fail-closed production-only inventory", () => {
  let allocatedWorkspace;
  withTemporaryPackageWorkspace(({ outputRoot, npmCache }) => {
    allocatedWorkspace = outputRoot;
    const dryFiles = inventoryFromDryRun(npmCache);
    assertProductionInventory(dryFiles);

    const packed = JSON.parse(run("npm", [
      "pack",
      "--json",
      "--ignore-scripts",
      "--pack-destination",
      outputRoot,
    ], npmCache));
    const tarball = path.join(outputRoot, packed[0].filename);
    const extracted = path.join(outputRoot, "extracted");
    mkdirSync(extracted, { mode: 0o700 });
    run("tar", ["-xzf", tarball, "-C", extracted], npmCache);
    const packageRoot = path.join(extracted, "package");
    const actualFiles = walkFiles(packageRoot);
    assert.deepEqual(actualFiles, dryFiles);
    assertProductionInventory(actualFiles);
    assertNoPrivateContent(packageRoot, actualFiles);

    const metadata = JSON.parse(readFileSync(
      path.join(packageRoot, "package.json"),
      "utf8",
    ));
    // Source checkouts retain main's explicitly gated local workflows under
    // D-95. Their source trees are excluded by the positive packlist above;
    // keep the mock command exact so it cannot silently become a production
    // default or point at a packaged showcase module.
    assert.equal(metadata.scripts?.mock, "ts-node src/index.ts --mock");
    assert.ok(
      metadata.files.every((entry) => !entry.startsWith("!")),
      "production packlist must be a positive allowlist",
    );
    assert.equal(
      metadata.files.includes("dist/src/"),
      false,
      "production packlist must not include the entire compiled source tree",
    );

    const dependencyTarballs = packProductionDependencies(
      lockedProductionDependencyDirectories(metadata),
      path.join(outputRoot, "production-dependency-tarballs"),
      npmCache,
    );
    const installRoot = path.join(outputRoot, "installed");
    mkdirSync(installRoot, { mode: 0o700 });
    run("npm", [
      "install",
      "--ignore-scripts",
      "--omit=dev",
      "--offline",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      "--prefix",
      installRoot,
      tarball,
      ...dependencyTarballs,
    ], npmCache);
    const installedPackageRoot = installedPackagePath(installRoot, metadata.name);
    assert.deepEqual(walkFiles(installedPackageRoot), actualFiles);

    const syntheticHome = path.join(outputRoot, "synthetic-home");
    mkdirSync(syntheticHome, { mode: 0o700 });
    const importableEntrypoints = [
      metadata.main,
      ...Object.entries(metadata.bin)
        .filter(([name]) => name !== "daobrew-wellness-setup")
        .map(([, entrypoint]) => entrypoint),
    ].filter((entrypoint, index, entries) =>
      entries.indexOf(entrypoint) === index
    );
    run("node", [
      "-e",
      hermeticImportProbe,
      installRoot,
      developmentNodeModules,
      ...importableEntrypoints.map((entrypoint) =>
        path.join(installedPackageRoot, entrypoint)
      ),
    ], npmCache, {
      cwd: installRoot,
      env: {
        ...process.env,
        HOME: syntheticHome,
        DAOBREW_CONFIG_FILE: path.join(syntheticHome, "missing-config.json"),
        NODE_OPTIONS: "",
        NODE_PATH: "",
        npm_config_cache: npmCache,
      },
    });
  });
  assert.equal(existsSync(allocatedWorkspace), false);
  assert.equal(existsSync(repositoryOutputRoot), false);
});

test("installed import provenance rejects every file outside its root", () => {
  let allocatedWorkspace;
  withTemporaryPackageWorkspace(({ outputRoot, npmCache }) => {
    allocatedWorkspace = outputRoot;
    const installRoot = path.join(outputRoot, "installed");
    mkdirSync(installRoot, { mode: 0o700 });
    const outsideModule = path.join(outputRoot, "outside-module.js");
    writeFileSync(outsideModule, "module.exports = true;\n", { mode: 0o600 });
    const result = spawnSync(process.execPath, [
      "-e",
      hermeticImportProbe,
      installRoot,
      developmentNodeModules,
      outsideModule,
    ], {
      cwd: installRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: path.join(outputRoot, "synthetic-home"),
        NODE_OPTIONS: "",
        NODE_PATH: "",
        npm_config_cache: npmCache,
      },
    });
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /outside-module\.js/);
  });
  assert.equal(existsSync(allocatedWorkspace), false);
  assert.equal(existsSync(repositoryOutputRoot), false);
});

test("successful package inspection leaves no repository-local residue", () => {
  assert.equal(existsSync(repositoryOutputRoot), false);
});

test("package inspection removes its isolated workspace after failure", () => {
  let allocatedWorkspace;
  assert.throws(
    () => withTemporaryPackageWorkspace(({ outputRoot }) => {
      allocatedWorkspace = outputRoot;
      throw new Error("synthetic package inspection failure");
    }),
    /synthetic package inspection failure/,
  );
  assert.equal(existsSync(allocatedWorkspace), false);
  assert.equal(existsSync(repositoryOutputRoot), false);
});
