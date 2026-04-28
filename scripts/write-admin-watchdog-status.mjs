import fs from "fs";
import path from "path";

const STATUS_PATH = path.join("data", "ui", "admin_watchdog_status.json");
const MATCHES_PATH = path.join("data", "ui", "matches.json");

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function main() {
  const now = new Date().toISOString();
  const existing = readJsonIfExists(STATUS_PATH) || {};
  const matchesPayload = readJsonIfExists(MATCHES_PATH) || {};
  const refreshSource = String(process.env.REFRESH_SOURCE || "").trim().toLowerCase();
  const fallbackTriggered = String(process.env.FALLBACK_TRIGGERED || "").trim().toLowerCase() === "true";
  const fallbackReason = String(process.env.FALLBACK_REASON || "").trim();
  const watchdogDecision = String(process.env.WATCHDOG_DECISION || "").trim();
  const watchdogReason = String(process.env.WATCHDOG_REASON || "").trim();
  const generatedAtUTC = String(matchesPayload.generatedAtUTC || "").trim();

  const next = {
    updatedAtUTC: now,
    lastSuccessfulRefreshUTC: existing.lastSuccessfulRefreshUTC || "",
    lastSuccessfulRefreshSource: existing.lastSuccessfulRefreshSource || "",
    lastFallbackTriggeredUTC: existing.lastFallbackTriggeredUTC || "",
    lastFallbackReason: existing.lastFallbackReason || "",
    lastWatchdogCheckUTC: existing.lastWatchdogCheckUTC || "",
    lastWatchdogDecision: existing.lastWatchdogDecision || "",
    lastWatchdogReason: existing.lastWatchdogReason || ""
  };

  if (refreshSource) {
    next.lastSuccessfulRefreshUTC = generatedAtUTC || now;
    next.lastSuccessfulRefreshSource = refreshSource;
  }

  if (fallbackTriggered) {
    next.lastFallbackTriggeredUTC = now;
    next.lastFallbackReason = fallbackReason || "Fallback rulat fara motiv explicit.";
  }

  if (watchdogDecision) {
    next.lastWatchdogCheckUTC = now;
    next.lastWatchdogDecision = watchdogDecision;
    next.lastWatchdogReason = watchdogReason || "";
  }

  ensureDir(STATUS_PATH);
  fs.writeFileSync(STATUS_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  process.stdout.write(`${STATUS_PATH}\n`);
}

main();
