export interface OAuthResult {
    status: "connected" | "error" | "cancelled";
    source: string;
    error?: string;
}
export declare function startOAuthFlow(source: "oura" | "google_fit", clientId: string, authUrl: string, tokenUrl: string, scopes: string[]): Promise<OAuthResult>;
