"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardURL = getDashboardURL;
exports.startDashboardServer = startDashboardServer;
exports.stopDashboardServer = stopDashboardServer;
const http_1 = require("http");
const dashboard_html_js_1 = require("./dashboard-html.js");
let server = null;
let serverPort = null;
function getDashboardURL() {
    return serverPort ? `http://localhost:${serverPort}` : null;
}
async function startDashboardServer(element, durationSec, client) {
    await stopDashboardServer();
    return new Promise((resolve, reject) => {
        const html = (0, dashboard_html_js_1.generateDashboardHTML)(element, durationSec);
        const s = (0, http_1.createServer)(async (req, res) => {
            if (req.url === "/" || req.url === "") {
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(html);
                return;
            }
            if (req.url === "/api/state") {
                res.writeHead(200, {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                });
                try {
                    const [breathState, liveHR] = await Promise.all([
                        client.getBreathState(),
                        client.getLiveHR(),
                    ]);
                    if (!breathState.active) {
                        res.end(JSON.stringify({ active: false }));
                        return;
                    }
                    res.end(JSON.stringify({
                        active: true,
                        pattern: breathState.pattern,
                        cycle_num: breathState.cycle_num,
                        cycle_sec: breathState.cycle_sec,
                        cycle_start_unix: breathState.cycle_start_unix,
                        params: breathState.current_params,
                        hr: liveHR.hr,
                        hr_age_sec: liveHR.age_seconds ?? null,
                        prev_cycle_hr_mean: breathState.prev_cycle_hr_mean,
                        prev_cycle_hr_std: breathState.prev_cycle_hr_std,
                        session_elapsed_sec: breathState.session_elapsed_sec,
                        session_total_sec: durationSec,
                        cycles_completed: breathState.cycles_completed,
                        _poll_ts: Date.now() / 1000,
                    }));
                }
                catch {
                    res.end(JSON.stringify({ active: false, error: "backend_unreachable" }));
                }
                return;
            }
            res.writeHead(404);
            res.end("Not found");
        });
        s.listen(0, "127.0.0.1", () => {
            const addr = s.address();
            if (addr && typeof addr === "object") {
                serverPort = addr.port;
                server = s;
                resolve(`http://localhost:${serverPort}`);
            }
            else {
                reject(new Error("Failed to bind dashboard server"));
            }
        });
        s.on("error", reject);
    });
}
async function stopDashboardServer() {
    if (server) {
        return new Promise((resolve) => {
            server.close(() => {
                server = null;
                serverPort = null;
                resolve();
            });
        });
    }
}
