import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { parseHealthCliArgs, healthCliPlan } from "../src/health/sync-cli.js";

const CONFIG_UUID = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const ENV_UUID = "8D6C05BD-9220-46F7-822C-23F0F0D2DA41";

describe("health sync CLI", () => {
  it("parses --backfill-days", () => {
    assert.deepStrictEqual(parseHealthCliArgs(["--backfill-days", "30"]), { backfillDays: 30 });
    assert.deepStrictEqual(parseHealthCliArgs([]), {});
  });
  it("rejects a non-positive or missing --backfill-days value", () => {
    assert.throws(() => parseHealthCliArgs(["--backfill-days", "0"]));
    assert.throws(() => parseHealthCliArgs(["--backfill-days"]));
  });
});

describe("health sync CLI authenticated enrollment", () => {
  const credential = "dbd_0123456789abcdefghijklmnopqrstuv";

  it("syncs with a complete bearer-only device enrollment", () => {
    const plan = healthCliPlan({
      api_url: "https://api.example.test/api/v1",
      device_credential: credential,
    });
    assert.strictEqual(plan.action, "sync");
    if (plan.action === "sync") {
      assert.strictEqual(plan.deviceCredential, credential);
      assert.strictEqual(plan.apiUrl, "https://api.example.test/api/v1");
      assert.strictEqual("userId" in plan, false);
      assert.strictEqual("deviceId" in plan, false);
    }
  });

  it("never accepts a legacy api_key or UUID as normal device auth", () => {
    const plan = healthCliPlan({
      api_url: "https://api.example.test/api/v1",
      api_key: "dbk_legacy",
      user_id: "11111111-1111-4111-8111-111111111111",
      device_id: "22222222-2222-4222-8222-222222222222",
    } as any);
    assert.strictEqual(plan.action, "skip");
    if (plan.action === "skip") {
      assert.match(plan.reason, /sign in|support/i);
      assert.doesNotMatch(plan.reason, /grant|paste/i);
    }
  });

  it("fails closed on a malformed device credential or missing API URL", () => {
    assert.strictEqual(healthCliPlan({ api_url: "https://api.example.test", device_credential: "dbk_wrong" }).action, "skip");
    assert.strictEqual(healthCliPlan({ device_credential: credential }).action, "skip");
  });
});
