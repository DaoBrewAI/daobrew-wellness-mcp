"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalUserId = canonicalUserId;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function canonicalUserId(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    if (!UUID_RE.test(trimmed))
        return null;
    return trimmed.toUpperCase();
}
