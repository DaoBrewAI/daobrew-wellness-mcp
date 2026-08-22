#!/usr/bin/env node
export interface OuraTaskMapContextCliArgs {
    help: boolean;
    outputPath?: string;
    startDate?: string;
    endDate?: string;
    backfillDays?: number;
    now?: Date;
}
export declare function parseOuraTaskMapContextCliArgs(argv: string[]): OuraTaskMapContextCliArgs;
export declare function resolveOuraTaskMapContextRange(args: OuraTaskMapContextCliArgs): {
    startDate: string;
    endDate: string;
    now: Date;
};
export declare function runOuraTaskMapContextCli(argv: string[]): Promise<void>;
