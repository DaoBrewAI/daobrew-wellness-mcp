/**
 * 5B consent gate — DEFAULT CLOSED. A user contributes to the cross-user
 * pool only with an explicit transfer_consent row flipped to opted_in; no
 * row means no. Opt-out purge deletes by the salted contributor hash, so
 * identity never has to appear in (or be joinable against) transfer_records.
 */
type Exec = (sql: string) => Promise<void>;
type Query = (sql: string) => Promise<Record<string, any>[]>;
export declare function isOptedIn(userId: string, query?: Query): Promise<boolean>;
export interface PurgeContributorInput {
    userId: string;
    /** Server-custody salt (DAOBREW_TRANSFER_SALT). Empty → fail closed. */
    salt: string;
    exec?: Exec;
    nowTs?: number;
}
export declare function purgeContributor(input: PurgeContributorInput): Promise<void>;
export declare function transferSalt(): string;
export {};
