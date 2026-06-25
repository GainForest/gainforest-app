#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";

function loadDotEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    process.env[key] ??= rawValue.replace(/^["']|["']$/g, "");
  }
}

loadDotEnvFile(".env.local");
loadDotEnvFile("e2e/.env");

const port = process.env.E2E_PORT || "3201";
const env = {
  ...process.env,
  E2E_PORT: port,
  NEXT_PUBLIC_AUTH_PROVIDER: process.env.NEXT_PUBLIC_AUTH_PROVIDER || "certs",
};

const children = [];
let stopping = false;

function spawnChild(name, command, args, onExit) {
  const child = spawn(command, args, {
    env,
    stdio: ["ignore", "inherit", "inherit"],
  });
  children.push(child);

  child.on("exit", (code, signal) => {
    if (stopping) return;
    onExit?.(code, signal);
  });

  return child;
}

function stopAll() {
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

function run(name, command, args) {
  return new Promise((resolve) => {
    spawnChild(name, command, args, (code, signal) => {
      if (signal) resolve(1);
      else resolve(code ?? 0);
    });
  });
}

function startLongRunning(name, command, args) {
  return spawnChild(name, command, args, (code, signal) => {
    console.error(`[e2e] ${name} exited early (${signal ?? code ?? "unknown"}).`);
    stopAll();
    process.exit(typeof code === "number" && code !== 0 ? code : 1);
  });
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(130);
});
process.on("SIGTERM", () => {
  stopAll();
  process.exit(143);
});

startLongRunning("caddy", "caddy", ["run", "--config", "Caddyfile"]);

const buildExitCode = await run("build", "pnpm", ["build"]);
if (buildExitCode !== 0) {
  stopAll();
  process.exit(buildExitCode);
}

startLongRunning("next", "pnpm", ["exec", "next", "start", "--port", port]);
setInterval(() => undefined, 60_000);
