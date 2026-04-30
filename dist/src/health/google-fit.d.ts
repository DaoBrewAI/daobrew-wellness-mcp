export interface GoogleFitToken {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    token_type: string;
}
export declare function isConnected(): boolean;
export declare function loadToken(): GoogleFitToken | null;
export declare function saveToken(token: GoogleFitToken): void;
export declare function exchangeCode(code: string, clientId: string, clientSecret: string, redirectUri: string): Promise<GoogleFitToken>;
export declare function refreshAccessToken(token: GoogleFitToken, clientId: string, clientSecret: string): Promise<GoogleFitToken>;
export declare function fetchDataSources(token: GoogleFitToken): Promise<any>;
export declare function fetchHeartRate(token: GoogleFitToken, startTimeMs: number, endTimeMs: number): Promise<any>;
