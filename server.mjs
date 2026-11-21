import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import QRCode from "qrcode";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ROOT, "public");
const MAX_JSON = 24 * 1024;
const MAX_FILE = 25 * 1024 * 1024;
const MAX_CLIPS = 30;

export function hashKey(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sanitizeFilename(value) {
  const leaf = String(value || "file").split(/[\\/]/).pop();
  const cleaned = leaf
    .replace(/[\u0000-\u001f<>:"|?*]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return cleaned.slice(0, 120) || "file";
}

export function dataDirectory(cwd = process.cwd()) {
  return resolve(process.env.DATA_DIR || join(dirname(cwd), `${cwd.split(/[\\/]/).pop()}-data`));
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(payload), "cache-control": "no-store" });
  res.end(payload);
}

function fail(res, status, message) {
  json(res, status, { error: message });
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON) throw new Error("request too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function contentType(file) {
  return ({ ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" })[extname(file)] || "application/octet-stream";
}

export async function createLanClipboard({ dataDir = dataDirectory() } = {}) {
  const filesDir = join(dataDir, "files");
  const stateFile = join(dataDir, "state.json");
  await mkdir(filesDir, { recursive: true });
  let state = { keyHash: null, clips: [], files: [] };
  try {
    state = { ...state, ...JSON.parse(await readFile(stateFile, "utf8")) };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  async function save() {
    const temp = `${stateFile}.tmp`;
    await writeFile(temp, JSON.stringify(state, null, 2));
    await rename(temp, stateFile);
  }

  function authenticated(req) {
    const value = req.headers.authorization || "";
    const key = value.startsWith("Bearer ") ? value.slice(7) : "";
    if (!key || !state.keyHash) return false;
    const actual = Buffer.from(hashKey(key));
    const expected = Buffer.from(state.keyHash);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  async function serveStatic(pathname, res) {
    const names = { "/": "index.html", "/app.js": "app.js", "/styles.css": "styles.css" };
    const name = names[pathname];
    if (!name) return false;
    const body = await readFile(join(PUBLIC, name));
    res.writeHead(200, {
      "content-type": contentType(name),
      "content-length": body.length,
      "cache-control": name === "index.html" ? "no-store" : "public, max-age=3600",
      "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    });
    res.end(body);
    return true;
  }

  async function handler(req, res) {
    const url = new URL(req.url, "http://localhost");
    try {
      if (req.method === "GET" && await serveStatic(url.pathname, res)) return;
      if (req.method === "GET" && url.pathname === "/api/status") return json(res, 200, { claimed: Boolean(state.keyHash) });

      if (req.method === "POST" && url.pathname === "/api/claim") {
        if (state.keyHash) return fail(res, 409, "This space has already been set up");
        const key = randomBytes(12).toString("base64url");
        state.keyHash = hashKey(key);
        await save();
        return json(res, 201, { key });
      }

      if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/files/")) return fail(res, 404, "Not found");
      if (!authenticated(req)) return fail(res, 401, "Device is not paired");

      if (req.method === "GET" && url.pathname === "/api/state") {
        return json(res, 200, { clips: state.clips, files: state.files });
      }

      if (req.method === "POST" && url.pathname === "/api/clipboard") {
        const body = await readJson(req);
        const text = String(body.text || "").trim();
        if (!text) return fail(res, 400, "Content cannot be empty");
        if (text.length > 8000) return fail(res, 413, "Content is limited to 8,000 characters");
        state.clips.unshift({ id: randomBytes(8).toString("hex"), text, createdAt: new Date().toISOString() });
        state.clips = state.clips.slice(0, MAX_CLIPS);
        await save();
        return json(res, 201, { ok: true });
      }

      const clipMatch = url.pathname.match(/^\/api\/clipboard\/([a-f0-9]{16})$/);
      if (req.method === "DELETE" && clipMatch) {
        state.clips = state.clips.filter((item) => item.id !== clipMatch[1]);
        await save();
        return json(res, 200, { ok: true });
      }

      if (req.method === "POST" && url.pathname === "/api/files") {
        const declared = Number(req.headers["content-length"] || 0);
        if (declared > MAX_FILE) return fail(res, 413, "Files are limited to 25 MB");
        const id = randomBytes(12).toString("hex");
        const name = sanitizeFilename(url.searchParams.get("name"));
        const target = join(filesDir, id);
        let received = 0;
        const limiter = new Transform({
          transform(chunk, _encoding, callback) {
            received += chunk.length;
            callback(received > MAX_FILE ? new Error("file too large") : null, chunk);
          },
        });
        try {
          await pipeline(req, limiter, createWriteStream(target, { flags: "wx" }));
        } catch (error) {
          await rm(target, { force: true });
          if (error.message === "file too large") return fail(res, 413, "Files are limited to 25 MB");
          throw error;
        }
        const item = { id, name, size: received, type: String(req.headers["content-type"] || "application/octet-stream").slice(0, 120), createdAt: new Date().toISOString() };
        state.files.unshift(item);
        state.files = state.files.slice(0, 100);
        await save();
        return json(res, 201, item);
      }

      const fileMatch = url.pathname.match(/^\/files\/([a-f0-9]{24})$/);
      if (fileMatch) {
        const item = state.files.find((file) => file.id === fileMatch[1]);
        if (!item) return fail(res, 404, "File not found");
        const target = join(filesDir, item.id);
        if (req.method === "DELETE") {
          await rm(target, { force: true });
          state.files = state.files.filter((file) => file.id !== item.id);
          await save();
          return json(res, 200, { ok: true });
        }
        if (req.method === "GET") {
          const info = await stat(target);
          res.writeHead(200, {
            "content-type": item.type,
            "content-length": info.size,
            "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(item.name)}`,
            "x-content-type-options": "nosniff",
          });
          return createReadStream(target).pipe(res);
        }
      }

      if (req.method === "POST" && url.pathname === "/api/qr") {
        const body = await readJson(req);
        const origin = new URL(String(body.origin || ""));
        if (origin.protocol !== "http:" && origin.protocol !== "https:") return fail(res, 400, "Invalid address");
        const key = String(req.headers.authorization).slice(7);
        origin.searchParams.set("key", key);
        const image = await QRCode.toDataURL(origin.toString(), { width: 320, margin: 1, color: { dark: "#101820", light: "#ffffff" } });
        return json(res, 200, { image, url: origin.toString() });
      }

      if (req.method === "POST" && url.pathname === "/api/rotate-key") {
        const key = randomBytes(12).toString("base64url");
        state.keyHash = hashKey(key);
        await save();
        return json(res, 200, { key });
      }

      return fail(res, 404, "Not found");
    } catch (error) {
      console.error(error);
      if (!res.headersSent) fail(res, 500, "Server error");
      else res.destroy();
    }
  }

  return { handler, getState: () => structuredClone(state) };
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4175);
  const host = process.env.HOST || "0.0.0.0";
  const app = await createLanClipboard();
  createServer(app.handler).listen(port, host, () => console.log(`LAN Clipboard listening on http://${host}:${port}`));
}
