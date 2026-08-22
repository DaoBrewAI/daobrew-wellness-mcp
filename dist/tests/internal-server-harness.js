"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postInternal = postInternal;
const node_stream_1 = require("node:stream");
const internal_server_js_1 = require("../src/engine/internal-server.js");
async function postInternal(path, body, options = {}, headers = { "content-type": "application/json" }) {
    const payload = typeof body === "string" ? body : JSON.stringify(body);
    const req = node_stream_1.Readable.from([payload]);
    req.method = "POST";
    req.url = path;
    req.headers = headers;
    let status = 0;
    let text = "";
    const res = new node_stream_1.Writable({
        write(chunk, _encoding, callback) {
            text += chunk.toString();
            callback();
        },
    });
    res.writeHead = (code) => {
        status = code;
        return res;
    };
    res.end = (chunk) => {
        if (chunk != null)
            text += Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
        node_stream_1.Writable.prototype.end.call(res);
        return res;
    };
    await (0, internal_server_js_1.handleRequest)(req, res, options);
    return { status, text, json: text ? JSON.parse(text) : null };
}
