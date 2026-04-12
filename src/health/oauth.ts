import { createServer, IncomingMessage, ServerResponse } from "http";
import { execFile } from "child_process";
import { mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PREFS_DIR = join(homedir(), ".daobrew");

export interface OAuthResult {
  status: "connected" | "error" | "cancelled";
  source: string;
  error?: string;
}

async function exchangeCodeForToken(
  source: "oura" | "google_fit",
  code: string,
  clientId: string,
  clientSecret: string,
  tokenUrl: string,
  redirectUri: string,
): Promise<void> {
  if (source === "oura") {
    const { exchangeCode } = await import("./oura.js");
    await exchangeCode(code, clientId, clientSecret, redirectUri);
  } else {
    const { exchangeCode } = await import("./google-fit.js");
    await exchangeCode(code, clientId, clientSecret, redirectUri);
  }
}

export async function startOAuthFlow(
  source: "oura" | "google_fit",
  clientId: string,
  authUrl: string,
  tokenUrl: string,
  scopes: string[],
): Promise<OAuthResult> {
  // Read client secret from env or config file
  let fileConfig: any = {};
  const configFile = join(homedir(), ".daobrew", "config.json");
  if (existsSync(configFile)) {
    try { fileConfig = JSON.parse(readFileSync(configFile, "utf-8")); } catch {}
  }
  const clientSecret = source === "oura"
    ? (process.env.DAOBREW_OURA_CLIENT_SECRET ?? fileConfig.oura_client_secret ?? "")
    : (process.env.DAOBREW_GOOGLE_CLIENT_SECRET ?? fileConfig.google_client_secret ?? "");

  return new Promise((resolve) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
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
          if (!existsSync(PREFS_DIR)) mkdirSync(PREFS_DIR, { recursive: true });
          const port = (server.address() as any).port;
          const redirectUri = `http://localhost:${port}/callback`;
          await exchangeCodeForToken(source, code, clientId, clientSecret, tokenUrl, redirectUri);
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<html><body><h2>DaoBrew connected! You can close this tab.</h2></body></html>");
          server.close();
          resolve({ status: "connected", source });
        } catch (err: any) {
          res.writeHead(500);
          res.end("Token exchange failed");
          server.close();
          resolve({ status: "error", source, error: err.message });
        }
      }
    });

    server.listen(0, () => {
      const port = (server.address() as any).port;
      const redirectUri = `http://localhost:${port}/callback`;
      const fullAuthUrl = `${authUrl}?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes.join(" "))}&response_type=code`;
      // Use execFile (no shell) to avoid command injection
      const openCmd = process.platform === "darwin" ? "open" : "xdg-open";
      execFile(openCmd, [fullAuthUrl], () => {});
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      server.close();
      resolve({ status: "cancelled", source, error: "OAuth flow timed out (2 min)" });
    }, 120000);
  });
}
