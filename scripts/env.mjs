import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnv(baseDir) {
  const fileEnv = {};

  for (const fileName of [".env", ".env.local"]) {
    const filePath = resolve(baseDir, fileName);
    if (existsSync(filePath)) {
      Object.assign(fileEnv, parseEnvFile(readFileSync(filePath, "utf8")));
    }
  }

  return { ...fileEnv, ...process.env };
}

function parseEnvFile(contents) {
  const env = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const normalized = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const match = normalized.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    env[match[1]] = parseEnvValue(match[2]);
  }

  return env;
}

function parseEnvValue(value) {
  let text = value.trim();
  if (!text) return "";

  const quote = text[0];
  if ((quote === "\"" || quote === "'") && text.endsWith(quote)) {
    text = text.slice(1, -1);
    return quote === "\"" ? text.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\"/g, "\"") : text;
  }

  const commentIndex = text.search(/\s#/);
  return (commentIndex === -1 ? text : text.slice(0, commentIndex)).trimEnd();
}
