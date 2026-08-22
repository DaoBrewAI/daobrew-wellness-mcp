import { createHash } from "node:crypto";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  loadConfirmedTaskMapOwnerSync,
  type ConfirmedTaskMapOwner,
} from "../../src/identity.js";
import { taskMapOwnerScopeDigest } from "../../src/engine/taskmap/owner-scope.js";

const CANONICAL_UUID =
  /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/u;
const fixtureRoot = path.join(
  process.cwd(),
  ".test-tmp",
  `confirmed-owner-${process.pid}`,
);
const owners = new Map<string, ConfirmedTaskMapOwner>();

function canonicalTestUserId(label: string): string {
  if (CANONICAL_UUID.test(label)) return label;
  const hex = createHash("sha256").update(label).digest("hex").toUpperCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function testOwnerScopeDigest(label: string): string {
  return taskMapOwnerScopeDigest(canonicalTestUserId(label));
}

export function confirmedTestOwner(
  label: string,
): ConfirmedTaskMapOwner {
  const cached = owners.get(label);
  if (cached !== undefined) return cached;
  const labelDigest = createHash("sha256").update(label).digest("hex");
  const homeDirectory = path.join(fixtureRoot, labelDigest);
  const configDirectory = path.join(homeDirectory, ".daobrew");
  mkdirSync(configDirectory, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(configDirectory, "config.json"), JSON.stringify({
    user_id: canonicalTestUserId(label),
    device_credential: `dbd_test_enrollment_${labelDigest}`,
    device_credential_confirmed: true,
    api_url: "https://confirmed-owner.test.invalid/api/v1",
  }), { mode: 0o600 });
  const plan = loadConfirmedTaskMapOwnerSync(homeDirectory);
  if (!plan.ok) throw new Error(plan.reason);
  owners.set(label, plan.owner);
  return plan.owner;
}

process.once("exit", () => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});
