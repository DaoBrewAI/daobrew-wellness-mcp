"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isConnected = isConnected;
exports.loadToken = loadToken;
exports.saveToken = saveToken;
exports.exchangeCode = exchangeCode;
exports.refreshAccessToken = refreshAccessToken;
exports.fetchDataSources = fetchDataSources;
exports.fetchHeartRate = fetchHeartRate;
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const PREFS_DIR = (0, path_1.join)((0, os_1.homedir)(), ".daobrew");
const TOKEN_FILE = (0, path_1.join)(PREFS_DIR, "google-fit-token.json");
const FITNESS_API_BASE = "https://www.googleapis.com/fitness/v1/users/me";
function isConnected() {
    return (0, fs_1.existsSync)(TOKEN_FILE);
}
function loadToken() {
    if (!(0, fs_1.existsSync)(TOKEN_FILE))
        return null;
    try {
        return JSON.parse((0, fs_1.readFileSync)(TOKEN_FILE, "utf-8"));
    }
    catch {
        return null;
    }
}
function saveToken(token) {
    if (!(0, fs_1.existsSync)(PREFS_DIR))
        (0, fs_1.mkdirSync)(PREFS_DIR, { recursive: true });
    (0, fs_1.writeFileSync)(TOKEN_FILE, JSON.stringify(token, null, 2));
}
async function exchangeCode(code, clientId, clientSecret, redirectUri) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
        }),
    });
    if (!response.ok) {
        throw new Error(`Google token exchange failed: ${response.status}`);
    }
    const data = await response.json();
    const token = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
        token_type: data.token_type ?? "Bearer",
    };
    saveToken(token);
    return token;
}
async function refreshAccessToken(token, clientId, clientSecret) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: token.refresh_token,
            client_id: clientId,
            client_secret: clientSecret,
        }),
    });
    if (!response.ok) {
        throw new Error(`Google token refresh failed: ${response.status}`);
    }
    const data = await response.json();
    const newToken = {
        access_token: data.access_token,
        refresh_token: token.refresh_token,
        expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
        token_type: data.token_type ?? "Bearer",
    };
    saveToken(newToken);
    return newToken;
}
async function fetchDataSources(token) {
    const response = await fetch(`${FITNESS_API_BASE}/dataSources`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!response.ok)
        throw new Error(`Google Fit API error: ${response.status}`);
    return response.json();
}
async function fetchHeartRate(token, startTimeMs, endTimeMs) {
    const response = await fetch(`${FITNESS_API_BASE}/dataset:aggregate`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token.access_token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            aggregateBy: [{ dataTypeName: "com.google.heart_rate.bpm" }],
            bucketByTime: { durationMillis: 3600000 },
            startTimeMillis: startTimeMs,
            endTimeMillis: endTimeMs,
        }),
    });
    if (!response.ok)
        throw new Error(`Google Fit API error: ${response.status}`);
    return response.json();
}
