"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startOAuthFlow = startOAuthFlow;
const http_1 = require("http");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const PREFS_DIR = (0, path_1.join)((0, os_1.homedir)(), ".daobrew");
async function exchangeCodeForToken(source, code, clientId, clientSecret, tokenUrl, redirectUri) {
    if (source === "oura") {
        const { exchangeCode } = await import("./oura.js");
        await exchangeCode(code, clientId, clientSecret, redirectUri);
    }
    else {
        const { exchangeCode } = await import("./google-fit.js");
        await exchangeCode(code, clientId, clientSecret, redirectUri);
    }
}
async function startOAuthFlow(source, clientId, authUrl, tokenUrl, scopes) {
    // Read client secret from env or config file
    let fileConfig = {};
    const configFile = (0, path_1.join)((0, os_1.homedir)(), ".daobrew", "config.json");
    if ((0, fs_1.existsSync)(configFile)) {
        try {
            fileConfig = JSON.parse((0, fs_1.readFileSync)(configFile, "utf-8"));
        }
        catch { }
    }
    const clientSecret = source === "oura"
        ? (process.env.DAOBREW_OURA_CLIENT_SECRET ?? fileConfig.oura_client_secret ?? "")
        : (process.env.DAOBREW_GOOGLE_CLIENT_SECRET ?? fileConfig.google_client_secret ?? "");
    return new Promise((resolve) => {
        const server = (0, http_1.createServer)(async (req, res) => {
            const url = new URL(req.url ?? "/", `http://localhost`);
            if (url.pathname === "/callback") {
                const code = url.searchParams.get("code");
                if (!code) {
                    res.writeHead(400);
                    res.end("Missing authorization code");
                    server.close();
                    resolve({ status: "error", source, error: "No authorization code received" });
                    return;
                }
                try {
                    if (!(0, fs_1.existsSync)(PREFS_DIR))
                        (0, fs_1.mkdirSync)(PREFS_DIR, { recursive: true });
                    const port = server.address().port;
                    const redirectUri = `http://localhost:${port}/callback`;
                    await exchangeCodeForToken(source, code, clientId, clientSecret, tokenUrl, redirectUri);
                    res.writeHead(200, { "Content-Type": "text/html" });
                    res.end("<html><body><h2>DaoBrew connected! You can close this tab.</h2></body></html>");
                    server.close();
                    resolve({ status: "connected", source });
                }
                catch (err) {
                    res.writeHead(500);
                    res.end("Token exchange failed");
                    server.close();
                    resolve({ status: "error", source, error: err.message });
                }
            }
        });
        server.listen(0, () => {
            const port = server.address().port;
            const redirectUri = `http://localhost:${port}/callback`;
            const fullAuthUrl = `${authUrl}?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes.join(" "))}&response_type=code`;
            // Use execFile (no shell) to avoid command injection
            const openCmd = process.platform === "darwin" ? "open" : "xdg-open";
            (0, child_process_1.execFile)(openCmd, [fullAuthUrl], () => { });
        });
        // Timeout after 2 minutes
        setTimeout(() => {
            server.close();
            resolve({ status: "cancelled", source, error: "OAuth flow timed out (2 min)" });
        }, 120000);
    });
}
