import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { basename, dirname, extname, join, normalize, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./env.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = loadEnv(rootDir);
const host = env.HOST || "0.0.0.0";
const port = Number(env.PORT || 5173);
const geminiApiKey = env.TODIDLOG_GEMINI_API_KEY || env.GEMINI_API_KEY || "";
const geminiTimeoutMs = Number(env.GEMINI_TIMEOUT_MS || 7000);
const geminiMaxOutputTokens = Number(env.GEMINI_MAX_OUTPUT_TOKENS || 1024);
const geminiThinkingBudget = Number(env.GEMINI_THINKING_BUDGET ?? 0);
const geminiGenerateUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";
const syncDatabasePath = resolveProjectPath(env.TODIDLOG_SQLITE_PATH || "data/todidlog.sqlite");
const registrationToken = env.TODIDLOG_REGISTRATION_TOKEN || "";
const cookieSecure = env.TODIDLOG_COOKIE_SECURE === "true";
const sessionDays = Number(env.TODIDLOG_SESSION_DAYS || 30);
const sessionMaxAgeSeconds = Math.max(1, Math.floor(sessionDays * 86400));
const geminiMaxJsonBytes = 64 * 1024;
const authMaxJsonBytes = 16 * 1024;
const syncMaxJsonBytes = Number(env.TODIDLOG_SYNC_MAX_JSON_BYTES || 5 * 1024 * 1024);
const maxPromptLength = 20000;
const stateDb = openStateDatabase(syncDatabasePath);
const sessionCookieName = "todidlog_session";
const usernamePattern = /^[A-Za-z0-9._-]{3,40}$/;
const scryptParams = { N: 16384, r: 8, p: 1, keyLength: 64, maxmem: 64 * 1024 * 1024 };
const geminiDetailsSchema = {
  type: "object",
  properties: {
    details: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          label: {
            type: "string",
            description: "A natural 1 to 3 word detail label.",
          },
          text: {
            type: "string",
            description: "One concise practical sentence.",
          },
        },
        required: ["label", "text"],
      },
    },
  },
  required: ["details"],
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/api/gemini/generate") {
      await handleGeminiGenerate(req, res);
      return;
    }

    if (url.pathname.startsWith("/api/auth/")) {
      await handleAuth(req, res, url);
      return;
    }

    if (url.pathname === "/api/state") {
      await handleState(req, res);
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error("[server] Request failed.", { status, message: error.message });
    sendJson(res, status, { error: status >= 500 ? "Internal server error." : error.message }, error.headers || {});
  }
});

server.listen(port, host, () => {
  for (const url of serverUrls(host, port)) console.log(`[server] TodidLog is running at ${url}`);
  console.log(`[server] State sync storage is ${syncDatabasePath}.`);
  console.log(`[server] User registration is ${registrationToken ? "token-gated" : "first-user only after setup"}.`);
  console.log(`[server] Gemini proxy is ${geminiApiKey ? "enabled" : "disabled: TODIDLOG_GEMINI_API_KEY is not configured"}.`);
});

async function handleAuth(req, res, url) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { Allow: "GET, POST, OPTIONS" });
    res.end();
    return;
  }

  if (url.pathname === "/api/auth/session") {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed." }, { Allow: "GET, OPTIONS" });
      return;
    }

    const user = authenticatedUser(req);
    sendJson(res, 200, {
      authenticated: Boolean(user),
      user,
      hasUsers: userCount() > 0,
      registrationOpen: isRegistrationOpen(),
    });
    return;
  }

  if (url.pathname === "/api/auth/register") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed." }, { Allow: "POST, OPTIONS" });
      return;
    }

    if (!isJsonRequest(req)) {
      sendJson(res, 415, { error: "Content-Type must be application/json." });
      return;
    }

    const body = await readJson(req, authMaxJsonBytes);
    const user = registerUser(body);
    const cookie = createSessionCookie(user.id);
    sendJson(res, 201, { authenticated: true, user }, { "Set-Cookie": cookie });
    return;
  }

  if (url.pathname === "/api/auth/login") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed." }, { Allow: "POST, OPTIONS" });
      return;
    }

    if (!isJsonRequest(req)) {
      sendJson(res, 415, { error: "Content-Type must be application/json." });
      return;
    }

    const body = await readJson(req, authMaxJsonBytes);
    const user = loginUser(body);
    const cookie = createSessionCookie(user.id);
    sendJson(res, 200, { authenticated: true, user }, { "Set-Cookie": cookie });
    return;
  }

  if (url.pathname === "/api/auth/logout") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed." }, { Allow: "POST, OPTIONS" });
      return;
    }

    destroySession(req);
    sendJson(res, 200, { authenticated: false }, { "Set-Cookie": expiredSessionCookie() });
    return;
  }

  sendJson(res, 404, { error: "Not found." });
}

async function handleState(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { Allow: "GET, PUT, OPTIONS" });
    res.end();
    return;
  }

  const user = authenticatedUser(req);
  if (!user) {
    sendJson(res, 401, { error: "Authentication is required.", authenticated: false }, { "Set-Cookie": expiredSessionCookie() });
    return;
  }

  if (req.method === "GET") {
    sendJson(res, 200, readStoredState(user.id));
    return;
  }

  if (req.method === "PUT") {
    if (!isJsonRequest(req)) {
      sendJson(res, 415, { error: "Content-Type must be application/json." });
      return;
    }

    const current = readStoredState(user.id);
    const body = await readJson(req, syncMaxJsonBytes);
    const expectedRevision = Number.isInteger(body.revision) ? body.revision : null;
    if (current.hasState && expectedRevision === null) {
      sendJson(res, 428, { error: "State revision is required.", revision: current.revision });
      return;
    }

    if (expectedRevision !== null && expectedRevision !== current.revision) {
      sendJson(res, 409, {
        error: "State revision conflict.",
        revision: current.revision,
        updatedAt: current.updatedAt,
      });
      return;
    }

    const nextState = normalizeStatePayload(body.state);
    const nextRevision = current.revision + 1;
    const updatedAt = writeStoredState(user.id, nextState, nextRevision);
    console.info("[server] TodidLog state updated.", { userId: user.id, revision: nextRevision, updatedAt });
    sendJson(res, 200, { hasState: true, revision: nextRevision, updatedAt });
    return;
  }

  sendJson(res, 405, { error: "Method not allowed." }, { Allow: "GET, PUT, OPTIONS" });
}

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

  const body = await readJson(req, geminiMaxJsonBytes);
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
          temperature: 0.45,
          maxOutputTokens: geminiMaxOutputTokens,
          responseMimeType: "application/json",
          responseSchema: geminiDetailsSchema,
          thinkingConfig: Number.isFinite(geminiThinkingBudget) ? { thinkingBudget: geminiThinkingBudget } : undefined,
        },
      }),
    });

    if (!response.ok) {
      const upstreamStatus = response.status;
      const retryAfter = response.headers.get("retry-after");
      console.warn("[server] Gemini upstream request failed.", { status: upstreamStatus });
      throw httpError(
        geminiProxyStatus(upstreamStatus),
        geminiProxyErrorMessage(upstreamStatus),
        retryAfter ? { "Retry-After": retryAfter } : {},
      );
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== "STOP") {
      console.warn("[server] Gemini response did not finish cleanly.", { finishReason: candidate.finishReason });
      throw httpError(502, "Gemini response was incomplete.");
    }

    const text = (candidate?.content?.parts || []).map((part) => part.text || "").join("").trim();
    if (!text) throw httpError(502, "Gemini returned an empty response.");
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function isJsonRequest(req) {
  return String(req.headers["content-type"] || "").toLowerCase().includes("application/json");
}

function openStateDatabase(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
  const database = new DatabaseSync(filePath);
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS user_state (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      payload TEXT NOT NULL,
      revision INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL,
      revision INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  database.prepare("DELETE FROM user_sessions WHERE expires_at <= ?").run(new Date().toISOString());
  return database;
}

function readStoredState(userId) {
  const row = stateDb
    .prepare("SELECT payload, revision, updated_at AS updatedAt FROM user_state WHERE user_id = ?")
    .get(userId);
  if (!row) {
    return {
      hasState: false,
      revision: 0,
      updatedAt: null,
      state: emptyStatePayload(),
    };
  }

  try {
    return {
      hasState: true,
      revision: Number(row.revision) || 0,
      updatedAt: row.updatedAt || null,
      state: normalizeStatePayload(JSON.parse(row.payload)),
    };
  } catch (error) {
    console.error("[server] Stored TodidLog state is not readable.", { message: error.message });
    throw httpError(500, "Stored state is not readable.");
  }
}

function writeStoredState(userId, state, revision) {
  const updatedAt = new Date().toISOString();
  stateDb
    .prepare(
      `INSERT INTO user_state (user_id, payload, revision, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         payload = excluded.payload,
         revision = excluded.revision,
         updated_at = excluded.updated_at`,
    )
    .run(userId, JSON.stringify(state), revision, updatedAt);
  return updatedAt;
}

function normalizeStatePayload(value) {
  if (!isPlainObject(value)) throw httpError(400, "State must be an object.");

  return {
    sessions: normalizeSessions(value.sessions),
    groups: normalizeGroups(value.groups),
    active: normalizeOptionalObject(value.active, "active"),
    fortuneProfile: normalizeOptionalObject(value.fortuneProfile, "fortuneProfile"),
  };
}

function normalizeSessions(value) {
  if (!Array.isArray(value)) throw httpError(400, "State sessions must be an array.");
  return value.map((session, index) => {
    if (!isPlainObject(session)) throw httpError(400, `Session at index ${index} must be an object.`);
    if (!isNonEmptyString(session.id)) throw httpError(400, `Session at index ${index} must include an id.`);
    if (!isNonEmptyString(session.date)) throw httpError(400, `Session at index ${index} must include a date.`);
    return session;
  });
}

function normalizeGroups(value) {
  if (!Array.isArray(value)) throw httpError(400, "State groups must be an array.");
  return value.map((group, index) => {
    if (!isPlainObject(group)) throw httpError(400, `Group at index ${index} must be an object.`);
    if (!isNonEmptyString(group.id)) throw httpError(400, `Group at index ${index} must include an id.`);
    if (!isNonEmptyString(group.date)) throw httpError(400, `Group at index ${index} must include a date.`);
    if (!Array.isArray(group.sessionIds)) throw httpError(400, `Group at index ${index} must include sessionIds.`);
    return group;
  });
}

function normalizeOptionalObject(value, name) {
  if (value === null || value === undefined) return null;
  if (!isPlainObject(value)) throw httpError(400, `State ${name} must be an object or null.`);
  return value;
}

function emptyStatePayload() {
  return {
    sessions: [],
    groups: [],
    active: null,
    fortuneProfile: null,
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function userCount() {
  return Number(stateDb.prepare("SELECT COUNT(*) AS count FROM users").get().count) || 0;
}

function isRegistrationOpen() {
  return userCount() === 0 || Boolean(registrationToken);
}

function registerUser(body) {
  const existingUsers = userCount();
  if (existingUsers > 0) {
    if (!registrationToken) throw httpError(403, "Registration is closed.");
    if (!secureStringEquals(String(body.registrationToken || ""), registrationToken)) {
      throw httpError(403, "Registration token is invalid.");
    }
  }

  const username = normalizeUsername(body.username);
  validatePassword(body.password);
  const now = new Date().toISOString();

  try {
    const result = stateDb
      .prepare("INSERT INTO users (username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(username, hashPassword(String(body.password)), now, now);
    const user = { id: Number(result.lastInsertRowid), username };
    seedFirstUserState(user.id, existingUsers);
    console.info("[server] TodidLog user registered.", { userId: user.id, username });
    return user;
  } catch (error) {
    if (String(error.message || "").includes("UNIQUE")) throw httpError(409, "Username is already taken.");
    throw error;
  }
}

function loginUser(body) {
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  const row = stateDb.prepare("SELECT id, username, password_hash AS passwordHash FROM users WHERE username = ?").get(username);

  if (!row || !verifyPassword(password, row.passwordHash)) {
    throw httpError(401, "Username or password is incorrect.");
  }

  return { id: Number(row.id), username: row.username };
}

function seedFirstUserState(userId, existingUsers) {
  if (existingUsers > 0) return;
  const legacy = readLegacyStoredState();
  if (!legacy?.hasState) return;
  writeStoredState(userId, legacy.state, Math.max(1, legacy.revision));
  console.info("[server] Legacy TodidLog state assigned to the first user.", { userId, revision: legacy.revision });
}

function readLegacyStoredState() {
  const table = stateDb
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_state'")
    .get();
  if (!table) return null;

  const row = stateDb.prepare("SELECT payload, revision, updated_at AS updatedAt FROM app_state WHERE id = 1").get();
  if (!row) return null;

  try {
    return {
      hasState: true,
      revision: Number(row.revision) || 1,
      updatedAt: row.updatedAt || null,
      state: normalizeStatePayload(JSON.parse(row.payload)),
    };
  } catch (error) {
    console.warn("[server] Legacy TodidLog state could not be assigned.", { message: error.message });
    return null;
  }
}

function normalizeUsername(value) {
  const username = String(value || "").trim();
  if (!usernamePattern.test(username)) {
    throw httpError(400, "Username must be 3 to 40 characters and use letters, numbers, dots, underscores, or hyphens.");
  }
  return username;
}

function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 8) throw httpError(400, "Password must be at least 8 characters.");
  if (password.length > 256) throw httpError(400, "Password is too long.");
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, scryptParams.keyLength, scryptOptions());
  return ["scrypt", scryptParams.N, scryptParams.r, scryptParams.p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

function verifyPassword(password, storedHash) {
  const parts = String(storedHash || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  const params = {
    N: Number(rawN),
    r: Number(rawR),
    p: Number(rawP),
    keyLength: Buffer.from(rawHash, "base64url").length,
    maxmem: scryptParams.maxmem,
  };
  if (!Number.isFinite(params.N) || !Number.isFinite(params.r) || !Number.isFinite(params.p) || !params.keyLength) {
    return false;
  }

  const expected = Buffer.from(rawHash, "base64url");
  const actual = scryptSync(password, Buffer.from(rawSalt, "base64url"), params.keyLength, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: params.maxmem,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function scryptOptions() {
  return {
    N: scryptParams.N,
    r: scryptParams.r,
    p: scryptParams.p,
    maxmem: scryptParams.maxmem,
  };
}

function authenticatedUser(req) {
  const token = sessionToken(req);
  if (!token) return null;

  const row = stateDb
    .prepare(
      `SELECT users.id, users.username, user_sessions.expires_at AS expiresAt
       FROM user_sessions
       JOIN users ON users.id = user_sessions.user_id
       WHERE user_sessions.token_hash = ?`,
    )
    .get(hashSessionToken(token));

  if (!row) return null;
  if (Date.parse(row.expiresAt) <= Date.now()) {
    stateDb.prepare("DELETE FROM user_sessions WHERE token_hash = ?").run(hashSessionToken(token));
    return null;
  }

  return { id: Number(row.id), username: row.username };
}

function createSessionCookie(userId) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionMaxAgeSeconds * 1000).toISOString();
  stateDb
    .prepare("INSERT INTO user_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(hashSessionToken(token), userId, now.toISOString(), expiresAt);
  return serializeSessionCookie(token, sessionMaxAgeSeconds);
}

function destroySession(req) {
  const token = sessionToken(req);
  if (!token) return;
  stateDb.prepare("DELETE FROM user_sessions WHERE token_hash = ?").run(hashSessionToken(token));
}

function sessionToken(req) {
  return parseCookies(req.headers.cookie || "")[sessionCookieName] || "";
}

function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("base64url");
}

function parseCookies(header) {
  return String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator === -1) return cookies;
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (key) cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function serializeSessionCookie(value, maxAge) {
  return [
    `${sessionCookieName}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    cookieSecure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function expiredSessionCookie() {
  return serializeSessionCookie("", 0);
}

function secureStringEquals(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
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
    "Cache-Control": cacheControl(target),
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
    ".woff": "font/woff",
  };

  return types[extname(filePath)] || "application/octet-stream";
}

function cacheControl(filePath) {
  const ext = extname(filePath);
  const name = basename(filePath);
  if (name === "index.html" || name === "service-worker.js" || [".css", ".js", ".webmanifest"].includes(ext)) {
    return "no-cache, max-age=0, must-revalidate";
  }
  if (ext === ".woff") return "public, max-age=31536000, immutable";
  return "public, max-age=300";
}

async function readJson(req, maxBytes) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) throw httpError(413, "Request body is too large.");
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

function geminiProxyStatus(status) {
  if (status === 429) return 429;
  if (status === 401 || status === 403) return 502;
  if (status >= 500) return 502;
  return 502;
}

function geminiProxyErrorMessage(status) {
  if (status === 429) return "Gemini quota or rate limit was reached.";
  if (status === 401 || status === 403) return "Gemini API key was rejected.";
  return "Gemini upstream request failed.";
}

function httpError(status, message, headers = {}) {
  const error = new Error(message);
  error.status = status;
  error.headers = headers;
  return error;
}

function resolveProjectPath(value) {
  return resolve(rootDir, value);
}

function serverUrls(boundHost, boundPort) {
  if (boundHost !== "0.0.0.0") return [`http://${boundHost}:${boundPort}`];

  const urls = [`http://localhost:${boundPort}`];
  for (const address of localIpv4Addresses()) urls.push(`http://${address}:${boundPort}`);
  return urls;
}

function localIpv4Addresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((network) => network && network.family === "IPv4" && !network.internal)
    .map((network) => network.address);
}
