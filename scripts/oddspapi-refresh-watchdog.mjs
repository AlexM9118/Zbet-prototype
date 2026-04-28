import fs from "fs";
import path from "path";

const TZ = "UTC";
const PRIMARY_REFRESH_DAYS = new Set([2, 4, 6]); // Tue / Thu / Sat in UTC
const FALLBACK_MAX_AGE_HOURS = 84;

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function toYmd(date, timeZone = TZ) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function toWeekday(date, timeZone = TZ) {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short"
  }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(label);
}

function setOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  const line = `${name}=${String(value)}\n`;
  if (outputPath) {
    fs.appendFileSync(outputPath, line, "utf8");
  }
  process.stdout.write(line);
}

function main() {
  const now = new Date();
  const todayYmd = toYmd(now, TZ);
  const weekday = toWeekday(now, TZ);
  const isPrimaryRefreshDay = PRIMARY_REFRESH_DAYS.has(weekday);

  const uiMatches = readJsonIfExists(path.join("data", "ui", "matches.json")) || {};
  const oddsIndex = readJsonIfExists(path.join("data", "oddspapi_odds_index.json")) || {};

  const generatedAtRaw = uiMatches.generatedAtUTC || oddsIndex.generatedAtUTC || "";
  const generatedAt = generatedAtRaw ? new Date(generatedAtRaw) : null;
  const generatedAtValid = generatedAt && Number.isFinite(generatedAt.getTime());
  const generatedYmd = generatedAtValid ? toYmd(generatedAt, TZ) : "";
  const ageHours = generatedAtValid ? Math.max(0, Math.round((now.getTime() - generatedAt.getTime()) / 3600000)) : null;

  const matches = Array.isArray(uiMatches.matches) ? uiMatches.matches : [];
  const latestAvailableDay = [...new Set(matches.map((match) => String(match?.day || "")).filter(Boolean))]
    .sort()
    .slice(-1)[0] || "";

  let refreshNeeded = false;
  let reason = "Snapshot-ul este in limite normale.";

  if (!generatedAtValid) {
    refreshNeeded = true;
    reason = "Lipseste generatedAtUTC in snapshot.";
  } else if (isPrimaryRefreshDay && generatedYmd !== todayYmd) {
    refreshNeeded = true;
    reason = `Astazi este zi programata de refresh, dar snapshot-ul este din ${generatedYmd || "necunoscut"}.`;
  } else if (ageHours != null && ageHours > FALLBACK_MAX_AGE_HOURS) {
    refreshNeeded = true;
    reason = `Snapshot-ul are ${ageHours}h, peste pragul de fallback de ${FALLBACK_MAX_AGE_HOURS}h.`;
  } else if (latestAvailableDay && latestAvailableDay < todayYmd) {
    refreshNeeded = true;
    reason = `Ultima zi disponibila in snapshot este ${latestAvailableDay}, in urma fata de ${todayYmd}.`;
  }

  const summary = {
    nowUTC: now.toISOString(),
    todayUTC: todayYmd,
    weekdayUTC: weekday,
    primaryRefreshDay: isPrimaryRefreshDay,
    generatedAtUTC: generatedAtRaw || "",
    generatedDayUTC: generatedYmd,
    ageHours,
    latestAvailableDay,
    refreshNeeded,
    reason
  };

  console.log(JSON.stringify(summary, null, 2));
  setOutput("refresh_needed", refreshNeeded ? "true" : "false");
  setOutput("reason", reason);
  setOutput("generated_at_utc", generatedAtRaw || "");
  setOutput("snapshot_age_hours", ageHours == null ? "" : String(ageHours));
  setOutput("latest_available_day", latestAvailableDay || "");
}

main();
