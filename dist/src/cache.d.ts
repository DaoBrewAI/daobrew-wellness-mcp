export declare function get<T>(key: string): {
    data: T;
    age_seconds: number;
} | null;
export declare function set<T>(key: string, data: T): void;
export declare function invalidate(key: string): void;
export declare function ageSeconds(key: string): number;
