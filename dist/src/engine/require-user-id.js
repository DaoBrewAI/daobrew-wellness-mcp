"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireUserId = requireUserId;
const user_id_js_1 = require("../user-id.js");
function requireUserId(value, context) {
    const userId = (0, user_id_js_1.canonicalUserId)(value);
    if (!userId) {
        throw new Error(`${context}: canonical UUID user_id is required`);
    }
    return userId;
}
