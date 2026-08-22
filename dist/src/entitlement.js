"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configPath = configPath;
exports.readEntitlementConfig = readEntitlementConfig;
exports.checkEntitlement = checkEntitlement;
exports.notEntitled = notEntitled;
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const crypto_1 = require("crypto");
const TOKEN_VERSION = "dbw_v1";
const DEFAULT_CHECKOUT_URL = "https://daobrew.com";
function configPath() {
    return process.env.DAOBREW_CONFIG_FILE || (0, path_1.join)((0, os_1.homedir)(), ".daobrew", "config.json");
}
function readEntitlementConfig(path = configPath()) {
    if (!(0, fs_1.existsSync)(path))
        return {};
    try {
        return JSON.parse((0, fs_1.readFileSync)(path, "utf-8"));
    }
    catch {
        return {};
    }
}
function checkEntitlement(config = readEntitlementConfig()) {
    const checkoutUrl = checkoutURL(config);
    const licenseKey = config.license_key?.trim();
    if (!licenseKey)
        return notEntitled("missing_license", checkoutUrl);
    const publicKey = entitlementPublicKey(config);
    if (!publicKey)
        return notEntitled("missing_public_key", checkoutUrl);
    const payload = verifyLicenseKey(licenseKey, publicKey);
    if (!payload.valid)
        return notEntitled(payload.reason, checkoutUrl);
    const nowSec = Math.floor(Date.now() / 1000);
    const license = payload.payload;
    if (license.iss !== "daobrew")
        return notEntitled("invalid_issuer", checkoutUrl);
    if (license.aud !== "sentinel")
        return notEntitled("invalid_audience", checkoutUrl);
    if (license.status !== "active")
        return notEntitled("inactive_license", checkoutUrl);
    if (license.tier !== "physician")
        return notEntitled("wrong_tier", checkoutUrl);
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
function notEntitled(reason, checkoutUrl = DEFAULT_CHECKOUT_URL) {
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
function checkoutURL(config) {
    return (process.env.DAOBREW_CHECKOUT_URL ||
        config.entitlement?.checkout_url ||
        config.checkout_url ||
        DEFAULT_CHECKOUT_URL);
}
function entitlementPublicKey(config) {
    return process.env.DAOBREW_LICENSE_PUBLIC_KEY || config.entitlement_public_key;
}
function verifyLicenseKey(licenseKey, publicKeyPem) {
    const parts = licenseKey.split(".");
    if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) {
        return { valid: false, reason: "malformed_license" };
    }
    const [, payloadPart, signaturePart] = parts;
    let payload;
    try {
        payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf-8"));
    }
    catch {
        return { valid: false, reason: "invalid_payload" };
    }
    try {
        const key = (0, crypto_1.createPublicKey)(publicKeyPem);
        const signed = Buffer.from(`${TOKEN_VERSION}.${payloadPart}`, "utf-8");
        const signature = Buffer.from(signaturePart, "base64url");
        if (!(0, crypto_1.verify)(null, signed, key, signature)) {
            return { valid: false, reason: "invalid_signature" };
        }
    }
    catch {
        return { valid: false, reason: "invalid_public_key" };
    }
    return { valid: true, payload };
}
