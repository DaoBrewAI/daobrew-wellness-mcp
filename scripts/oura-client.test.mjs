import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  parseArgs,
  selectOuraOAuthMode,
} from "./oura-client.mjs";

const managedConfig = {
  api_url: "https://api.daobrew.example/api/v1",
  device_credential: `dbd_${"a".repeat(32)}`,
};

describe("Oura client CLI modes", () => {
  it("accepts the Swift helper's explicit --login --managed contract", () => {
    assert.deepStrictEqual(parseArgs(["--login", "--managed"]), {
      login: true,
      openBrowser: true,
      managed: true,
      personalApp: false,
    });
  });

  it("rejects conflicting explicit modes", () => {
    assert.throws(
      () => parseArgs(["--login", "--managed", "--personal-app"]),
      /either --managed or --personal-app/i,
    );
  });

  it("defaults enrolled installs to managed OAuth", () => {
    assert.strictEqual(selectOuraOAuthMode(managedConfig), "managed");
  });

  it("lets explicit --managed override a legacy personal preference", () => {
    assert.strictEqual(selectOuraOAuthMode({
      ...managedConfig,
      oura_oauth_mode: "personal",
      oura_client_id: "personal-id",
      oura_client_secret: "personal-secret",
    }, false, true), "managed");
  });

  it("retains complete personal credentials as the legacy fallback", () => {
    assert.strictEqual(selectOuraOAuthMode({
      oura_client_id: "personal-id",
      oura_client_secret: "personal-secret",
    }), "personal");
  });

  it("does not downgrade an invalid managed authority to personal OAuth", () => {
    assert.throws(
      () => selectOuraOAuthMode({
        device_credential: "invalid-device-credential",
        api_url: managedConfig.api_url,
        oura_client_id: "personal-id",
        oura_client_secret: "personal-secret",
      }),
      /device enrollment/i,
    );
  });
});
