import fs from "fs";
import path from "path";

const TZ = "UTC";
const MATCHES_PATH = path.join("data", "ui", "matches.json");

function readJson(filePath) {
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

function main() {
  if (!fs.existsSync(MATCHES_PATH)) {
    throw new Error(`Missing ${MATCHES_PATH}`);
  }

  const now = new Date();
  const todayYmd = toYmd(now, TZ);
  const maxAgeHours = Number(process.env.MAX_SNAPSHOT_AGE_HOURS || 30);
  const matchesPayload = readJson(MATCHES_PATH);
  const generatedAtRaw = String(matchesPayload.generatedAtUTC || "");
  const generatedAt = generatedAtRaw ? new Date(generatedAtRaw) : null;
  const generatedAtValid = generatedAt && Number.isFinite(generatedAt.getTime());
  const ageHours = generatedAtValid
    ? Math.max(0, Math.round((now.getTime() - generatedAt.getTime()) / 3600000))
    : null;
  const matches = Array.isArray(matchesPayload.matches) ? matchesPayload.matches : [];
  const latestAvailableDay = [...new Set(matches.map((match) => String(match?.day || "")).filter(Boolean))]
    .sort()
    .slice(-1)[0] || "";

  const issues = [];
  if (!generatedAtValid) {
    issues.push("matches.json nu are generatedAtUTC valid.");
  }
  if (ageHours != null && ageHours > maxAgeHours) {
    issues.push(`snapshot-ul are ${ageHours}h, peste pragul de ${maxAgeHours}h.`);
  }
  if (!latestAvailableDay) {
    issues.push("snapshot-ul nu contine nicio zi disponibila.");
  } else if (latestAvailableDay < todayYmd) {
    issues.push(`ultima zi disponibila este ${latestAvailableDay}, in urma fata de ${todayYmd}.`);
  }

  const summary = {
    checkedAtUTC: now.toISOString(),
    generatedAtUTC: generatedAtRaw || "",
    ageHours,
    latestAvailableDay,
    todayUTC: todayYmd,
    matchesCount: matches.length,
    ok: issues.length === 0,
    issues
  };

  console.log(JSON.stringify(summary, null, 2));

  if (issues.length) {
    throw new Error(`Snapshot stale after refresh: ${issues.join(" ")}`);
  }
}

main();
