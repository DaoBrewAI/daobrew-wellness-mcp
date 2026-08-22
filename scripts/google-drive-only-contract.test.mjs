import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");

function read(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

describe("Google meeting notes Drive-only contract", () => {
  it("has no Gmail scope, endpoint, provider, scan, or injectable discovery dependency", () => {
    const activeSources = [
      "daobrew-wellness-mcp/src/engine/taskmap/gemini-meet-adapter.ts",
      "daobrew-wellness-mcp/scripts/gdocs-client.mjs",
      "DaobrewSentinelMac/Sources/SentinelMac/Sections/GdocsSetupSheet.swift",
      "DaobrewSentinelMac/Sources/SentinelMac/Network/TaskMapGoogleWorkspaceProducerClient.swift",
    ];
    const joined = activeSources.map((path) => read(path)).join("\n");

    assert.doesNotMatch(joined, /googleapis\.com\/auth\/gmail/i);
    assert.doesNotMatch(joined, /gmail\.googleapis\.com/i);
    assert.doesNotMatch(joined, /gmailDiscovery|GmailProvider|listGmail|scanGmail/i);
  });

  it("requests only Drive, Docs, and Calendar read-only Google scopes", () => {
    const setup = read(
      "DaobrewSentinelMac/Sources/SentinelMac/Sections/GdocsSetupSheet.swift",
    );
    const scopes = [...setup.matchAll(
      /https:\/\/www\.googleapis\.com\/auth\/[A-Za-z0-9._-]+/g,
    )].map((match) => match[0]);

    assert.deepEqual([...new Set(scopes)].sort(), [
      "https://www.googleapis.com/auth/calendar.events.readonly",
      "https://www.googleapis.com/auth/documents.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ]);
  });

  it("binds every packaged Google invocation to the owner token and no Granola input", () => {
    const daemon = read(
      "DaobrewSentinelMac/Sources/SentinelMac/Resources/Scripts/daobrew-ingest-daemon.sh",
    );
    const producer = read(
      "DaobrewSentinelMac/Sources/SentinelMac/Network/TaskMapGoogleWorkspaceProducerClient.swift",
    );

    assert.match(daemon, /TASKMAP_OWNER_ROOT="\$HOME\/Library\/Application Support\/DaoBrew\/owners\/\$TASKMAP_OWNER_DIGEST"/);
    assert.match(daemon, /--token-file "\$gdocs_token"/);
    assert.match(daemon, /--token-file "\$GDOCS_TOKEN_FILE"/);
    assert.doesNotMatch(daemon, /--granola-variant-snapshot/);
    assert.doesNotMatch(
      daemon,
      /Application Support\/DaoBrew\/gdocs-token\.json/,
    );
    assert.match(producer, /"--token-file", tokenFile\.path/);
    assert.doesNotMatch(producer, /granola-mcp-snapshot/);
  });
});
