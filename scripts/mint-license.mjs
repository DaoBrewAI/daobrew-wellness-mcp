#!/usr/bin/env node
// mint-license.mjs — issue a signed DaoBrew license (dbw_v1 format).
//
// Dev/founder use: generates an ed25519 keypair, signs the payload, and (with
// --install) writes license_key + entitlement_public_key into
// ~/.daobrew/config.json. The private key is DISCARDED unless --keep-private
// is passed — a machine-local license needs no future signatures.
//
// Production use: run once with --keep-private, store the private key in the
// checkout backend's secret manager, ship only entitlement_public_key to
// clients, and sign per-order payloads server-side.
//
// Usage:
//   node scripts/mint-license.mjs --sub you@example.com [--tier physician]
//        [--days 365] [--install] [--keep-private]
//
// Without --install, prints the license_key and public PEM to stdout.

import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : true;
};

const sub = flag("sub");
if (!sub || sub === true) {
  console.error("Usage: node scripts/mint-license.mjs --sub <email> [--tier physician] [--days 365] [--install] [--keep-private]");
  process.exit(1);
}
const tier = flag("tier", "physician");
const days = Number(flag("days", "365"));
const install = args.includes("--install");
const keepPrivate = args.includes("--keep-private");

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicPem = publicKey.export({ type: "spki", format: "pem" });

const nowSec = Math.floor(Date.now() / 1000);
const payload = {
  iss: "daobrew",
  aud: "sentinel",
  sub,
  tier,
  status: "active",
  iat: nowSec,
  exp: nowSec + days * 86_400,
  checkout_provider: "dev",
  order_id: `dev_${nowSec}`,
};

const part = Buffer.from(JSON.stringify(payload)).toString("base64url");
const signature = sign(null, Buffer.from(`dbw_v1.${part}`, "utf-8"), privateKey).toString("base64url");
const licenseKey = `dbw_v1.${part}.${signature}`;

if (install) {
  const configPath = join(homedir(), ".daobrew", "config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.license_key = licenseKey;
  config.entitlement_public_key = publicPem;
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(JSON.stringify({ installed: true, sub, tier, expires_days: days, config: configPath }, null, 2));
} else {
  console.log(JSON.stringify({ license_key: licenseKey, entitlement_public_key: publicPem, sub, tier, expires_days: days }, null, 2));
}

if (keepPrivate) {
  console.error(privateKey.export({ type: "pkcs8", format: "pem" }));
}
