import { InternalServerOptions } from "../src/engine/internal-server.js";
export declare function postInternal(path: string, body: unknown, options?: InternalServerOptions, headers?: Record<string, string>): Promise<{
    status: number;
    json: any;
    text: string;
}>;
