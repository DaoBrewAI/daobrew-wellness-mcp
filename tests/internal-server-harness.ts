import { Readable, Writable } from "node:stream";
import { handleRequest, InternalServerOptions } from "../src/engine/internal-server.js";

export async function postInternal(
  path: string,
  body: unknown,
  options: InternalServerOptions = {},
  headers: Record<string, string> = { "content-type": "application/json" },
): Promise<{ status: number; json: any; text: string }> {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const req = Readable.from([payload]) as any;
  req.method = "POST";
  req.url = path;
  req.headers = headers;

  let status = 0;
  let text = "";
  const res = new Writable({
    write(chunk, _encoding, callback) {
      text += chunk.toString();
      callback();
    },
  }) as any;
  res.writeHead = (code: number) => {
    status = code;
    return res;
  };
  res.end = (chunk?: unknown) => {
    if (chunk != null) text += Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
    (Writable.prototype.end as any).call(res);
    return res;
  };

  await handleRequest(req, res, options);
  return { status, text, json: text ? JSON.parse(text) : null };
}
