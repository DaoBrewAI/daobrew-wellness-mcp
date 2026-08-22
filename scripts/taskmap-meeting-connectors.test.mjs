import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  inspectTaskMapMeetingConnectors,
  TASKMAP_MEETING_CONNECTOR_READINESS_VERSION,
} from "./taskmap-meeting-connectors.mjs";

const SCRIPT_PATH = fileURLToPath(
  new URL("./taskmap-meeting-connectors.mjs", import.meta.url),
);

function tempHome(t) {
  const root = mkdtempSync(join(tmpdir(), "taskmap-meeting-readiness-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function privateJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
  writeFileSync(
    filePath,
    typeof value === "string" ? value : JSON.stringify(value),
    { mode: 0o600 },
  );
  chmodSync(filePath, 0o600);
}

function ownerPaths(home) {
  return {
    config: join(home, ".daobrew", "config.json"),
    gdocsToken: join(
      home,
      "Library",
      "Application Support",
      "DaoBrew",
      "gdocs-token.json",
    ),
    granolaToken: join(
      home,
      "Library",
      "Application Support",
      "DaoBrew",
      "granola-mcp-token.json",
    ),
    snapshot: join(
      home,
      ".daobrew",
      "taskmap",
      "meeting-producer-snapshot.v1.json",
    ),
    daemon: join(home, ".daobrew", "daobrew-ingest-daemon.sh"),
    runtime: join(
      home,
      "Library",
      "Application Support",
      "DaoBrew",
      "engine",
      "current",
    ),
  };
}

function createRuntime(
  runtimeRoot,
  daemonPath,
  { capable = true, executionSentinel = null } = {},
) {
  const modulePath = join(
    runtimeRoot,
    "dist",
    "src",
    "engine",
    "taskmap",
    "meeting-producer-freshness.js",
  );
  const gdocsPath = join(runtimeRoot, "scripts", "gdocs-client.mjs");
  mkdirSync(dirname(modulePath), { recursive: true });
  mkdirSync(dirname(gdocsPath), { recursive: true });
  writeFileSync(
    join(runtimeRoot, "package.json"),
    JSON.stringify({ type: "module" }),
    { mode: 0o644 },
  );
  mkdirSync(dirname(daemonPath), { recursive: true, mode: 0o700 });
  writeFileSync(
    daemonPath,
    capable
      ? [
        "#!/bin/sh",
        "MEETING_PRODUCER_INTERVAL_SECONDS=14400",
        "run_meeting_producers() {",
        "  node gdocs-client.mjs --export-taskmap-producer snapshot.json",
        "}",
        "",
      ].join("\n")
      : "#!/bin/sh\n# legacy daemon\n",
    { mode: 0o700 },
  );
  writeFileSync(
    gdocsPath,
    capable
      ? "// --export-taskmap-producer\n// includeTabsContent\n"
      : "// legacy gdocs client\n",
    { mode: 0o644 },
  );
  writeFileSync(
    modulePath,
    [
      'import { readFileSync, writeFileSync } from "node:fs";',
      'import { join } from "node:path";',
      ...(executionSentinel === null
        ? []
        : [`writeFileSync(${JSON.stringify(executionSentinel)}, "executed");`]),
      "export function taskMapMeetingProducerSnapshotPath(home) {",
      '  return join(home, ".daobrew", "taskmap", "meeting-producer-snapshot.v1.json");',
      "}",
      "export function taskMapMeetingProducerOwnerScopeDigest(userId) {",
      '  if (userId === "INVALID_OWNER") throw new Error("invalid owner");',
      '  return `owner-scope:${userId}`;',
      "}",
      "export async function loadTaskMapMeetingProducerResult(input) {",
      '  const value = JSON.parse(readFileSync(input.snapshotPath, "utf8"));',
      "  const decision = value.ownerScopeDigest === input.expectedOwnerScopeDigest",
      '    ? value.testDecision',
      '    : "malformed";',
      "  return { freshness: { decision } };",
      "}",
      "",
    ].join("\n"),
    { mode: 0o644 },
  );
  return runtimeRoot;
}

function readyOwnerState(home, { granola = false } = {}) {
  const paths = ownerPaths(home);
  privateJson(paths.config, {
    user_id: "SENSITIVE_OWNER_ID",
    gdocs_client_id: "SENSITIVE_GOOGLE_CLIENT",
    gdocs_client_secret: "SENSITIVE_GOOGLE_SECRET",
    gdocs_folder_id: "SENSITIVE_FOLDER_ID",
  });
  privateJson(paths.gdocsToken, {
    access_token: "SENSITIVE_GDOCS_ACCESS_TOKEN",
    refresh_token: "SENSITIVE_GDOCS_REFRESH_TOKEN",
  });
  if (granola) {
    privateJson(paths.granolaToken, {
      access_token: "SENSITIVE_GRANOLA_ACCESS_TOKEN",
    });
  }
  createRuntime(paths.runtime, paths.daemon);
  return paths;
}

async function inspect(home) {
  const paths = ownerPaths(home);
  return inspectTaskMapMeetingConnectors({
    homeDirectory: home,
    runtimeRoot: paths.runtime,
  });
}

test("absent owner state is coarse, non-mutating, and action-oriented", async (t) => {
  const home = tempHome(t);
  const before = readdirSync(home);
  const result = await inspect(home);

  assert.deepEqual(result, {
    contractVersion: TASKMAP_MEETING_CONNECTOR_READINESS_VERSION,
    ownerIdentity: { readiness: "missing" },
    gdocsPrimary: { readiness: "blocked_owner_identity" },
    granolaMcp: {
      readiness: "not_configured",
      required: false,
    },
    plaudMcp: {
      readiness: "unavailable_optional",
      required: false,
    },
    packagedM2Producer: { capability: "runtime_missing" },
    currentProducerArtifact: {
      presence: "absent",
      currentness: "not_validated",
    },
    readyForLocalProduction: false,
    nextAction: "configure_owner_identity",
    optionalGranolaAction: "login_granola_mcp_optional",
    privacy: {
      providerCallsPerformed: false,
      mutationsPerformed: false,
      identifiersReturned: false,
      pathsReturned: false,
      credentialsReturned: false,
    },
  });
  assert.deepEqual(readdirSync(home), before);
});

test("readiness reports staged fields without self-attesting runtime or snapshot", async (t) => {
  const home = tempHome(t);
  const paths = ownerPaths(home);

  privateJson(paths.config, { user_id: "SENSITIVE_OWNER_ID" });
  let result = await inspect(home);
  assert.equal(result.packagedM2Producer.capability, "runtime_missing");
  assert.equal(result.gdocsPrimary.readiness, "missing_configuration");
  assert.equal(result.nextAction, "install_m2_runtime");

  createRuntime(paths.runtime, paths.daemon);
  result = await inspect(home);
  assert.equal(
    result.packagedM2Producer.capability,
    "capability_unverified",
  );
  assert.equal(result.nextAction, "verify_m2_runtime");

  privateJson(paths.config, {
    user_id: "SENSITIVE_OWNER_ID",
    gdocs_client_id: "SENSITIVE_GOOGLE_CLIENT",
    gdocs_client_secret: "SENSITIVE_GOOGLE_SECRET",
    gdocs_folder_id: "SENSITIVE_FOLDER_ID",
  });
  result = await inspect(home);
  assert.equal(result.gdocsPrimary.readiness, "missing_token");
  assert.equal(result.nextAction, "verify_m2_runtime");

  privateJson(paths.gdocsToken, {
    access_token: "SENSITIVE_GDOCS_ACCESS_TOKEN",
    refresh_token: "SENSITIVE_GDOCS_REFRESH_TOKEN",
  });
  result = await inspect(home);
  assert.equal(result.gdocsPrimary.readiness, "ready");
  assert.equal(result.readyForLocalProduction, false);
  assert.equal(result.currentProducerArtifact.presence, "absent");
  assert.equal(result.nextAction, "verify_m2_runtime");

  privateJson(paths.snapshot, {
    ownerScopeDigest: "owner-scope:SENSITIVE_OWNER_ID",
    testDecision: "fresh",
  });
  result = await inspect(home);
  assert.equal(result.currentProducerArtifact.presence, "present");
  assert.equal(result.currentProducerArtifact.currentness, "not_validated");
  assert.equal(result.nextAction, "verify_m2_runtime");
});

test("artifact content cannot self-attest freshness or runtime capability", async (t) => {
  const home = tempHome(t);
  const paths = readyOwnerState(home);

  for (const decision of [
    "fresh",
    "boundary_due",
    "stale",
    "unknown_version",
    "malformed",
  ]) {
    privateJson(paths.snapshot, {
      ownerScopeDigest: "owner-scope:SENSITIVE_OWNER_ID",
      testDecision: decision,
    });
    const result = await inspect(home);
    assert.equal(
      result.packagedM2Producer.capability,
      "capability_unverified",
    );
    assert.equal(result.currentProducerArtifact.currentness, "not_validated");
    assert.equal(result.readyForLocalProduction, false);
    assert.equal(result.nextAction, "verify_m2_runtime");
  }

  privateJson(paths.snapshot, "{malformed");
  const malformed = await inspect(home);
  assert.equal(malformed.currentProducerArtifact.presence, "present");
  assert.equal(malformed.currentProducerArtifact.currentness, "not_validated");
  assert.equal(malformed.nextAction, "verify_m2_runtime");
});

test("unsafe and invalid private state fail closed without disclosing the target", async (t) => {
  await t.test("symlinked config", async (t) => {
    const home = tempHome(t);
    const paths = ownerPaths(home);
    const target = join(home, "SENSITIVE_PRIVATE_CONFIG_TARGET");
    privateJson(target, { user_id: "SENSITIVE_OWNER_ID" });
    mkdirSync(dirname(paths.config), { recursive: true, mode: 0o700 });
    symlinkSync(target, paths.config);

    const result = await inspect(home);
    assert.equal(result.ownerIdentity.readiness, "unsafe");
    assert.equal(result.nextAction, "repair_unsafe_local_state");
    assert.doesNotMatch(JSON.stringify(result), /SENSITIVE_PRIVATE_CONFIG_TARGET/);
  });

  await t.test("world-readable token", async (t) => {
    const home = tempHome(t);
    const paths = readyOwnerState(home);
    chmodSync(paths.gdocsToken, 0o644);

    const result = await inspect(home);
    assert.equal(result.gdocsPrimary.readiness, "unsafe");
    assert.equal(result.nextAction, "repair_unsafe_local_state");
  });

  await t.test("world-readable producer artifact", async (t) => {
    const home = tempHome(t);
    const paths = readyOwnerState(home);
    privateJson(paths.snapshot, {
      ownerScopeDigest: "owner-scope:SENSITIVE_OWNER_ID",
      testDecision: "fresh",
    });
    chmodSync(paths.snapshot, 0o644);

    const result = await inspect(home);
    assert.equal(result.currentProducerArtifact.presence, "unsafe");
    assert.equal(result.readyForLocalProduction, false);
    assert.equal(result.nextAction, "repair_unsafe_local_state");
  });

  await t.test("malformed config", async (t) => {
    const home = tempHome(t);
    const paths = ownerPaths(home);
    privateJson(paths.config, "{malformed");

    const result = await inspect(home);
    assert.equal(result.ownerIdentity.readiness, "invalid");
    assert.equal(result.gdocsPrimary.readiness, "invalid");
    assert.equal(result.nextAction, "repair_invalid_local_state");
  });

  await t.test("bounded owner identity rejects control characters", async (t) => {
    const home = tempHome(t);
    const paths = readyOwnerState(home);
    privateJson(paths.config, {
      user_id: "INVALID\u0001OWNER",
      gdocs_client_id: "SENSITIVE_GOOGLE_CLIENT",
      gdocs_client_secret: "SENSITIVE_GOOGLE_SECRET",
      gdocs_folder_id: "SENSITIVE_FOLDER_ID",
    });

    const result = await inspect(home);
    assert.equal(result.ownerIdentity.readiness, "invalid");
    assert.equal(result.gdocsPrimary.readiness, "blocked_owner_identity");
    assert.equal(result.readyForLocalProduction, false);
    assert.equal(result.nextAction, "repair_invalid_local_state");
  });
});

test("missing or unsafe packaged capability never reports production-ready", async (t) => {
  await t.test("incomplete runtime directories", async (t) => {
    const home = tempHome(t);
    const paths = ownerPaths(home);
    privateJson(paths.config, { user_id: "SENSITIVE_OWNER_ID" });
    mkdirSync(paths.runtime, { recursive: true });

    const result = await inspect(home);
    assert.equal(result.packagedM2Producer.capability, "capability_missing");
    assert.equal(result.readyForLocalProduction, false);
    assert.equal(result.nextAction, "install_m2_runtime");
  });

  await t.test("legacy runtime", async (t) => {
    const home = tempHome(t);
    const paths = ownerPaths(home);
    privateJson(paths.config, { user_id: "SENSITIVE_OWNER_ID" });
    createRuntime(paths.runtime, paths.daemon, { capable: false });

    const result = await inspect(home);
    assert.equal(result.packagedM2Producer.capability, "capability_missing");
    assert.equal(result.readyForLocalProduction, false);
    assert.equal(result.nextAction, "install_m2_runtime");
  });

  await t.test("M2 engine with a legacy installed cadence daemon", async (t) => {
    const home = tempHome(t);
    const paths = ownerPaths(home);
    privateJson(paths.config, { user_id: "SENSITIVE_OWNER_ID" });
    createRuntime(paths.runtime, paths.daemon);
    writeFileSync(paths.daemon, "#!/bin/sh\n# legacy cadence\n", {
      mode: 0o700,
    });

    const result = await inspect(home);
    assert.equal(result.packagedM2Producer.capability, "capability_missing");
    assert.equal(result.readyForLocalProduction, false);
    assert.equal(result.nextAction, "install_m2_runtime");
  });

  await t.test("writable runtime", async (t) => {
    const home = tempHome(t);
    const paths = ownerPaths(home);
    privateJson(paths.config, { user_id: "SENSITIVE_OWNER_ID" });
    createRuntime(paths.runtime, paths.daemon);
    chmodSync(paths.runtime, 0o777);

    const result = await inspect(home);
    assert.equal(result.packagedM2Producer.capability, "runtime_unsafe");
    assert.equal(result.readyForLocalProduction, false);
    assert.equal(result.nextAction, "repair_unsafe_local_state");
  });

  await t.test("runtime current symlink escapes the engine directory", async (t) => {
    const home = tempHome(t);
    const paths = ownerPaths(home);
    privateJson(paths.config, { user_id: "SENSITIVE_OWNER_ID" });
    const outsideRuntime = join(home, "outside-engine-runtime");
    createRuntime(outsideRuntime, paths.daemon);
    mkdirSync(dirname(paths.runtime), { recursive: true });
    symlinkSync(outsideRuntime, paths.runtime);

    const result = await inspect(home);
    assert.equal(result.packagedM2Producer.capability, "runtime_unsafe");
    assert.equal(result.readyForLocalProduction, false);
    assert.equal(result.nextAction, "repair_unsafe_local_state");
  });

  await t.test("intermediate runtime directory symlink", async (t) => {
    const home = tempHome(t);
    const paths = ownerPaths(home);
    privateJson(paths.config, { user_id: "SENSITIVE_OWNER_ID" });
    createRuntime(paths.runtime, paths.daemon);
    const outsideScripts = join(home, "outside-scripts");
    mkdirSync(outsideScripts);
    writeFileSync(
      join(outsideScripts, "gdocs-client.mjs"),
      "// --export-taskmap-producer\n// includeTabsContent\n",
    );
    rmSync(join(paths.runtime, "scripts"), { recursive: true });
    symlinkSync(outsideScripts, join(paths.runtime, "scripts"));

    const result = await inspect(home);
    assert.equal(result.packagedM2Producer.capability, "runtime_unsafe");
    assert.equal(result.readyForLocalProduction, false);
    assert.equal(result.nextAction, "repair_unsafe_local_state");
  });

  await t.test("marker-complete runtime module is never executed", async (t) => {
    const home = tempHome(t);
    const paths = ownerPaths(home);
    const executionSentinel = join(home, "RUNTIME_MODULE_EXECUTED");
    privateJson(paths.config, { user_id: "SENSITIVE_OWNER_ID" });
    createRuntime(paths.runtime, paths.daemon, { executionSentinel });

    const result = await inspect(home);
    assert.equal(
      result.packagedM2Producer.capability,
      "capability_unverified",
    );
    assert.equal(result.readyForLocalProduction, false);
    assert.equal(result.nextAction, "verify_m2_runtime");
    assert.equal(existsSync(executionSentinel), false);
  });
});

test("optional Granola MCP readiness never blocks the primary producer", async (t) => {
  const home = tempHome(t);
  const paths = readyOwnerState(home);
  privateJson(paths.snapshot, {
    ownerScopeDigest: "owner-scope:SENSITIVE_OWNER_ID",
    testDecision: "fresh",
  });

  let result = await inspect(home);
  assert.equal(result.granolaMcp.readiness, "not_configured");
  assert.equal(result.nextAction, "verify_m2_runtime");
  assert.equal(result.optionalGranolaAction, "login_granola_mcp_optional");

  privateJson(paths.granolaToken, {
    access_token: "SENSITIVE_GRANOLA_ACCESS_TOKEN",
  });
  result = await inspect(home);
  assert.equal(result.granolaMcp.readiness, "ready");
  assert.equal(result.nextAction, "verify_m2_runtime");
  assert.equal(result.optionalGranolaAction, "none");

  privateJson(paths.granolaToken, {
    refresh_token: "SENSITIVE_GRANOLA_REFRESH_WITHOUT_ACCESS",
  });
  result = await inspect(home);
  assert.equal(result.granolaMcp.readiness, "invalid");
  assert.equal(result.nextAction, "verify_m2_runtime");
  assert.equal(result.optionalGranolaAction, "repair_granola_mcp_optional");
});

test("optional Plaud capability is explicit and never blocks Drive primary", async (t) => {
  const home = tempHome(t);
  const paths = readyOwnerState(home);
  privateJson(paths.snapshot, {
    ownerScopeDigest: "owner-scope:SENSITIVE_OWNER_ID",
    testDecision: "fresh",
  });

  let result = await inspect(home);
  assert.deepEqual(result.plaudMcp, {
    readiness: "unavailable_optional",
    required: false,
  });
  assert.equal(result.nextAction, "verify_m2_runtime");

  writeFileSync(
    join(paths.runtime, "scripts", "plaud-mcp-client.mjs"),
    "// @plaud-ai/mcp\n// --non-interactive\n",
    { mode: 0o600 },
  );
  result = await inspect(home);
  assert.deepEqual(result.plaudMcp, {
    readiness: "available_unverified",
    required: false,
  });
  assert.equal(result.nextAction, "verify_m2_runtime");
});

test("serialized status never returns owner identifiers, credentials, or paths", async (t) => {
  const home = tempHome(t);
  const paths = readyOwnerState(home, { granola: true });
  privateJson(paths.snapshot, {
    ownerScopeDigest: "owner-scope:SENSITIVE_OWNER_ID",
    testDecision: "fresh",
  });

  const serialized = JSON.stringify(await inspect(home));
  for (const forbidden of [
    home,
    "SENSITIVE_OWNER_ID",
    "SENSITIVE_GOOGLE_CLIENT",
    "SENSITIVE_GOOGLE_SECRET",
    "SENSITIVE_FOLDER_ID",
    "SENSITIVE_GDOCS_ACCESS_TOKEN",
    "SENSITIVE_GDOCS_REFRESH_TOKEN",
    "SENSITIVE_GRANOLA_ACCESS_TOKEN",
  ]) {
    assert.doesNotMatch(
      serialized,
      new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
});

test("CLI is provider-call-free, mutation-free, and emits only coarse status", (t) => {
  const home = tempHome(t);
  const preload = join(home, "provider-sentinel.mjs");
  writeFileSync(
    preload,
    "globalThis.fetch = async () => { throw new Error('PROVIDER_CALL_SENTINEL'); };\n",
    { mode: 0o600 },
  );
  const before = readdirSync(home).sort();
  const child = spawnSync(
    process.execPath,
    ["--import", pathToFileURL(preload).href, SCRIPT_PATH, "--status"],
    {
      encoding: "utf8",
      env: { ...process.env, HOME: home },
    },
  );

  assert.equal(child.status, 0);
  assert.equal(child.stderr, "");
  const output = JSON.parse(child.stdout);
  assert.equal(output.contractVersion, TASKMAP_MEETING_CONNECTOR_READINESS_VERSION);
  assert.equal(output.nextAction, "configure_owner_identity");
  assert.equal(output.privacy.providerCallsPerformed, false);
  assert.equal(output.privacy.mutationsPerformed, false);
  assert.doesNotMatch(child.stdout, /PROVIDER_CALL_SENTINEL/);
  assert.doesNotMatch(child.stdout, new RegExp(home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.deepEqual(readdirSync(home).sort(), before);
});
