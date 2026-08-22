"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const node_crypto_1 = require("node:crypto");
const entitlement_js_1 = require("../src/entitlement.js");
function signedLicense(payloadOverrides = {}) {
    const { publicKey, privateKey } = (0, node_crypto_1.generateKeyPairSync)("ed25519");
    const publicPem = publicKey.export({ type: "spki", format: "pem" });
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
    const signature = (0, node_crypto_1.sign)(null, Buffer.from(`dbw_v1.${payloadPart}`, "utf-8"), privateKey).toString("base64url");
    return {
        publicPem,
        licenseKey: `dbw_v1.${payloadPart}.${signature}`,
    };
}
(0, node_test_1.describe)("entitlement", () => {
    (0, node_test_1.it)("rejects missing license", () => {
        const result = (0, entitlement_js_1.checkEntitlement)({ checkout_url: "https://pay.example" });
        assert.equal(result.entitled, false);
        assert.equal(result.reason, "missing_license");
        assert.equal(result.install_and_pay?.checkout_url, "https://pay.example");
    });
    (0, node_test_1.it)("accepts an active physician license", () => {
        const license = signedLicense();
        const result = (0, entitlement_js_1.checkEntitlement)({
            license_key: license.licenseKey,
            entitlement_public_key: license.publicPem,
            checkout_url: "https://pay.example",
        });
        assert.equal(result.entitled, true);
        assert.equal(result.entitlement?.tier, "physician");
        assert.equal(result.entitlement?.subject, "neo@example.com");
    });
    (0, node_test_1.it)("rejects the wrong tier", () => {
        const license = signedLicense({ tier: "free" });
        const result = (0, entitlement_js_1.checkEntitlement)({
            license_key: license.licenseKey,
            entitlement_public_key: license.publicPem,
        });
        assert.equal(result.entitled, false);
        assert.equal(result.reason, "wrong_tier");
    });
});
