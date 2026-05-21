import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./env.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = loadEnv(rootDir);
const host = env.HOST || "127.0.0.1";
const port = Number(env.PORT || 5173);
const geminiApiKey = env.TODIDLOG_GEMINI_API_KEY || env.GEMINI_API_KEY || "";
const geminiTimeoutMs = Number(env.GEMINI_TIMEOUT_MS || 7000);
const geminiGenerateUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";
const maxJsonBytes = 64 * 1024;
const maxPromptLength = 20000;

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/api/gemini/generate") {
      await handleGeminiGenerate(req, res);
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error("[server] Request failed.", { status, message: error.message });
    sendJson(res, status, { error: status >= 500 ? "Internal server error." : error.message });
  }
});

server.listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  console.log(`[server] TodidLog is running at http://${displayHost}:${port}`);
  console.log(`[server] Gemini proxy is ${geminiApiKey ? "enabled" : "disabled: TODIDLOG_GEMINI_API_KEY is not configured"}.`);
});

async function handleGeminiGenerate(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { Allow: "POST, OPTIONS" });
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed." }, { Allow: "POST, OPTIONS" });
    return;
  }

  if (!isJsonRequest(req)) {
    sendJson(res, 415, { error: "Content-Type must be application/json." });
    return;
  }

  if (!geminiApiKey) {
    sendJson(res, 503, { error: "Gemini API key is not configured." });
    return;
  }

  const body = await readJson(req);
  const prompt = String(body.prompt || "").trim();
  if (!prompt) {
    sendJson(res, 400, { error: "Prompt is required." });
    return;
  }

  if (prompt.length > maxPromptLength) {
    sendJson(res, 413, { error: "Prompt is too large." });
    return;
  }

  const text = await requestGemini(prompt);
  sendJson(res, 200, { text });
}

async function requestGemini(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), geminiTimeoutMs);

  try {
    const response = await fetch(geminiGenerateUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": geminiApiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      console.warn("[server] Gemini upstream request failed.", { status: response.status });
      throw httpError(502, "Gemini upstream request failed.");
    }

    const data = await response.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("").trim();
    if (!text) throw httpError(502, "Gemini returned an empty response.");
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function isJsonRequest(req) {
  return String(req.headers["content-type"] || "").toLowerCase().includes("application/json");
}

function serveStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const filePath = staticFilePath(url.pathname);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const target = resolve(filePath);
  if (!existsSync(target) || !statSync(target).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": contentType(target),
    "Cache-Control": target.endsWith("index.html") ? "no-cache" : "public, max-age=300",
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  createReadStream(target).pipe(res);
}

function staticFilePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const normalized = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const relativePath = normalized === sep ? "index.html" : normalized.replace(/^[/\\]/, "");
  const target = resolve(rootDir, relativePath);
  if (target !== rootDir && !target.startsWith(`${rootDir}${sep}`)) return null;
  return statDirectoryFallback(target);
}

function statDirectoryFallback(target) {
  if (existsSync(target) && statSync(target).isDirectory()) return join(target, "index.html");
  return target;
}

function contentType(filePath) {
  const types = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json; charset=utf-8",
  };

  return types[extname(filePath)] || "application/octet-stream";
}

async function readJson(req) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxJsonBytes) throw httpError(413, "Request body is too large.");
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw httpError(400, "Invalid JSON body.");
  }
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
