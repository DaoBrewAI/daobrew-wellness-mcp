export interface OuraToken {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    token_type: string;
}
export declare function isConnected(): boolean;
export declare function loadToken(): OuraToken | null;
export declare function saveToken(token: OuraToken): void;
export declare function exchangeCode(code: string, clientId: string, clientSecret: string, redirectUri: string): Promise<OuraToken>;
export declare function refreshAccessToken(token: OuraToken): Promise<OuraToken>;
export declare function fetchDailyReadiness(token: OuraToken, startDate?: string, endDate?: string): Promise<any>;
export declare function fetchHeartRate(token: OuraToken, startDate?: string, endDate?: string): Promise<any>;
export declare function fetchSleep(token: OuraToken, startDate?: string, endDate?: string): Promise<any>;
