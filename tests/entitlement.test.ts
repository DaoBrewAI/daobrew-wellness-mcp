import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { checkEntitlement } from "../src/entitlement.js";

function signedLicense(payloadOverrides: Record<string, unknown> = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ type: "spki", format: "pem" }) as string;
  const payload = {
    iss: "daobrew",
    aud: "sentinel",
    sub: "neo@example.com",
    tier: "physician",
    status: "active",
    iat: 1_700_000_000,
    exp: Math.floor(Date.now() / 1000) + 86_400,
    checkout_provider: "stripe",
    order_id: "test_order",
    ...payloadOverrides,
  };
  const payloadPart = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(null, Buffer.from(`dbw_v1.${payloadPart}`, "utf-8"), privateKey).toString("base64url");
  return {
    publicPem,
    licenseKey: `dbw_v1.${payloadPart}.${signature}`,
  };
}

describe("entitlement", () => {
  it("rejects missing license", () => {
    const result = checkEntitlement({ checkout_url: "https://pay.example" });

    assert.equal(result.entitled, false);
    assert.equal(result.reason, "missing_license");
    assert.equal(result.install_and_pay?.checkout_url, "https://pay.example");
  });

  it("accepts an active physician license", () => {
    const license = signedLicense();
    const result = checkEntitlement({
      license_key: license.licenseKey,
      entitlement_public_key: license.publicPem,
      checkout_url: "https://pay.example",
    });

    assert.equal(result.entitled, true);
    assert.equal(result.entitlement?.tier, "physician");
    assert.equal(result.entitlement?.subject, "neo@example.com");
  });

  it("rejects the wrong tier", () => {
    const license = signedLicense({ tier: "free" });
    const result = checkEntitlement({
      license_key: license.licenseKey,
      entitlement_public_key: license.publicPem,
    });

    assert.equal(result.entitled, false);
    assert.equal(result.reason, "wrong_tier");
  });
});
