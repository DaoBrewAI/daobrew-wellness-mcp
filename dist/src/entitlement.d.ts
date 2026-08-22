export interface EntitlementConfig {
    license_key?: string;
    checkout_url?: string;
    entitlement_public_key?: string;
    entitlement?: {
        status?: string;
        tier?: string;
        subject?: string;
        expires_at?: number;
        checkout_url?: string;
    };
}
export interface ActiveEntitlement {
    status: "active";
    tier: string;
    subject: string;
    expires_at?: number;
    checkout_url: string;
}
export interface EntitlementCheck {
    entitled: boolean;
    reason?: string;
    entitlement?: ActiveEntitlement;
    install_and_pay?: {
        checkout_url: string;
        steps: string[];
    };
}
export declare function configPath(): string;
export declare function readEntitlementConfig(path?: string): EntitlementConfig;
export declare function checkEntitlement(config?: EntitlementConfig): EntitlementCheck;
export declare function notEntitled(reason: string | undefined, checkoutUrl?: string): EntitlementCheck;
