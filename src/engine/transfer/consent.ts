import { execSql, q, queryJson } from "../../graph-db.js";
import { scopedUserIdExpr } from "../user-scope.js";
import { contributorHash } from "../memory/keys.js";

/**
 * 5B consent gate — DEFAULT CLOSED. A user contributes to the cross-user
 * pool only with an explicit transfer_consent row flipped to opted_in; no
 * row means no. Opt-out purge deletes by the salted contributor hash, so
 * identity never has to appear in (or be joinable against) transfer_records.
 */

type Exec = (sql: string) => Promise<void>;
type Query = (sql: string) => Promise<Record<string, any>[]>;

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

export async function isOptedIn(userId: string, query: Query = queryJson): Promise<boolean> {
  const rows = await query(
    `SELECT opted_in FROM transfer_consent WHERE user_id = ${scopedUserIdExpr(userId)} LIMIT 1`,
  );
  return rows.length > 0 && asBool(rows[0].opted_in);
}

export interface PurgeContributorInput {
  userId: string;
  /** Server-custody salt (DAOBREW_TRANSFER_SALT). Empty → fail closed. */
  salt: string;
  exec?: Exec;
  nowTs?: number;
}

export async function purgeContributor(input: PurgeContributorInput): Promise<void> {
  if (!input.salt) {
    throw new Error("DAOBREW_TRANSFER_SALT is required to derive the contributor hash for purge");
  }
  const exec = input.exec ?? execSql;
  const now = input.nowTs ?? Math.floor(Date.now() / 1000);
  const hash = contributorHash(input.userId, input.salt);
  await exec(`DELETE FROM transfer_records WHERE contributor_hash = ${q(hash)};`);
  await exec(
    `INSERT INTO transfer_consent(user_id, opted_in, updated_at_ts)
     VALUES (${q(input.userId)}, FALSE, ${now})
     ON CONFLICT (user_id) DO UPDATE SET opted_in = FALSE, updated_at_ts = ${now};`,
  );
}

export function transferSalt(): string {
  return process.env.DAOBREW_TRANSFER_SALT?.trim() ?? "";
}
