"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isOptedIn = isOptedIn;
exports.purgeContributor = purgeContributor;
exports.transferSalt = transferSalt;
const graph_db_js_1 = require("../../graph-db.js");
const user_scope_js_1 = require("../user-scope.js");
const keys_js_1 = require("../memory/keys.js");
function asBool(value) {
    return value === true || value === "t" || value === "true" || value === 1;
}
async function isOptedIn(userId, query = graph_db_js_1.queryJson) {
    const rows = await query(`SELECT opted_in FROM transfer_consent WHERE user_id = ${(0, user_scope_js_1.scopedUserIdExpr)(userId)} LIMIT 1`);
    return rows.length > 0 && asBool(rows[0].opted_in);
}
async function purgeContributor(input) {
    if (!input.salt) {
        throw new Error("DAOBREW_TRANSFER_SALT is required to derive the contributor hash for purge");
    }
    const exec = input.exec ?? graph_db_js_1.execSql;
    const now = input.nowTs ?? Math.floor(Date.now() / 1000);
    const hash = (0, keys_js_1.contributorHash)(input.userId, input.salt);
    await exec(`DELETE FROM transfer_records WHERE contributor_hash = ${(0, graph_db_js_1.q)(hash)};`);
    await exec(`INSERT INTO transfer_consent(user_id, opted_in, updated_at_ts)
     VALUES (${(0, graph_db_js_1.q)(input.userId)}, FALSE, ${now})
     ON CONFLICT (user_id) DO UPDATE SET opted_in = FALSE, updated_at_ts = ${now};`);
}
function transferSalt() {
    return process.env.DAOBREW_TRANSFER_SALT?.trim() ?? "";
}
