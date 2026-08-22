import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createPublicKey, verify } from "crypto";

const TOKEN_VERSION = "dbw_v1";
const DEFAULT_CHECKOUT_URL = "https://daobrew.com";

export interface EntitlementConfig {
  license_key?: string;
  checkout_url?: string;
  entitlement_public_key?: string;
  entitlement?: {
    status?: string;
    tier?: string;
    subject?: string;
    expires_at?: number;
    checkout_url?: string;
  };
}

interface LicensePayload {
  iss?: string;
  aud?: string;
  sub?: string;
  tier?: string;
  status?: string;
  iat?: number;
  exp?: number;
  checkout_provider?: string;
  order_id?: string;
}

export interface ActiveEntitlement {
  status: "active";
  tier: string;
  subject: string;
  expires_at?: number;
  checkout_url: string;
}

export interface EntitlementCheck {
  entitled: boolean;
  reason?: string;
  entitlement?: ActiveEntitlement;
  install_and_pay?: {
    checkout_url: string;
    steps: string[];
  };
}

export function configPath(): string {
  return process.env.DAOBREW_CONFIG_FILE || join(homedir(), ".daobrew", "config.json");
}

export function readEntitlementConfig(path: string = configPath()): EntitlementConfig {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as EntitlementConfig;
  } catch {
    return {};
  }
}

export function checkEntitlement(config: EntitlementConfig = readEntitlementConfig()): EntitlementCheck {
  const checkoutUrl = checkoutURL(config);
  const licenseKey = config.license_key?.trim();
  if (!licenseKey) return notEntitled("missing_license", checkoutUrl);

  const publicKey = entitlementPublicKey(config);
  if (!publicKey) return notEntitled("missing_public_key", checkoutUrl);

  const payload = verifyLicenseKey(licenseKey, publicKey);
  if (!payload.valid) return notEntitled(payload.reason, checkoutUrl);

  const nowSec = Math.floor(Date.now() / 1000);
  const license = payload.payload;
  if (license.iss !== "daobrew") return notEntitled("invalid_issuer", checkoutUrl);
  if (license.aud !== "sentinel") return notEntitled("invalid_audience", checkoutUrl);
  if (license.status !== "active") return notEntitled("inactive_license", checkoutUrl);
  if (license.tier !== "physician") return notEntitled("wrong_tier", checkoutUrl);
  if (typeof license.exp === "number" && license.exp <= nowSec) {
    return notEntitled("expired_license", checkoutUrl);
  }

  return {
    entitled: true,
    entitlement: {
      status: "active",
      tier: license.tier,
      subject: license.sub || "unlicensed-subject",
      expires_at: license.exp,
      checkout_url: checkoutUrl,
    },
  };
}

export function notEntitled(reason: string | undefined, checkoutUrl: string = DEFAULT_CHECKOUT_URL): EntitlementCheck {
  return {
    entitled: false,
    reason: reason || "not_entitled",
    install_and_pay: {
      checkout_url: checkoutUrl,
      steps: [
        "Install Sentinel.",
        "Connect your workspace.",
        "Pay for DaoBrew Physician.",
        "Paste the issued license_key into ~/.daobrew/config.json.",
        "Open the Sentinel action package again.",
      ],
    },
  };
}

function checkoutURL(config: EntitlementConfig): string {
  return (
    process.env.DAOBREW_CHECKOUT_URL ||
    config.entitlement?.checkout_url ||
    config.checkout_url ||
    DEFAULT_CHECKOUT_URL
  );
}

function entitlementPublicKey(config: EntitlementConfig): string | undefined {
  return process.env.DAOBREW_LICENSE_PUBLIC_KEY || config.entitlement_public_key;
}

function verifyLicenseKey(
  licenseKey: string,
  publicKeyPem: string,
): { valid: true; payload: LicensePayload } | { valid: false; reason: string } {
  const parts = licenseKey.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) {
    return { valid: false, reason: "malformed_license" };
  }

  const [, payloadPart, signaturePart] = parts;
  let payload: LicensePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf-8"));
  } catch {
    return { valid: false, reason: "invalid_payload" };
  }

  try {
    const key = createPublicKey(publicKeyPem);
    const signed = Buffer.from(`${TOKEN_VERSION}.${payloadPart}`, "utf-8");
    const signature = Buffer.from(signaturePart, "base64url");
    if (!verify(null, signed, key, signature)) {
      return { valid: false, reason: "invalid_signature" };
    }
  } catch {
    return { valid: false, reason: "invalid_public_key" };
  }

  return { valid: true, payload };
}
