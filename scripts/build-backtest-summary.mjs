import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SOURCE_HISTORY_DIR = path.resolve(ROOT, "..", "data", "history");
const OUTPUT_FILE = path.resolve(ROOT, "data", "ui", "backtest_summary.json");

const { estGoals, probBTTS, prob1X2, probTotalOver } = await import(pathToFileURL(path.resolve(ROOT, "js", "models.mjs")).href);

const GOALS_LINES = [1.5, 2.5, 3.5];

function avg(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function summarizeSide(rows, side) {
  const isHome = side === "home";
  return {
    [`${side}Matches`]: rows.length,
    [`${side}GF`]: avg(rows.map((row) => isHome ? row.fthg : row.ftag)),
    [`${side}GA`]: avg(rows.map((row) => isHome ? row.ftag : row.fthg)),
    [`${side}CornersFor`]: avg(rows.map((row) => isHome ? row.hc : row.ac)),
    [`${side}CornersAgainst`]: avg(rows.map((row) => isHome ? row.ac : row.hc)),
    [`${side}YCFor`]: avg(rows.map((row) => isHome ? row.hy : row.ay)),
    [`${side}YCAgainst`]: avg(rows.map((row) => isHome ? row.ay : row.hy))
  };
}

function buildEntry(homeRows, awayRows) {
  return {
    homeStats: summarizeSide(homeRows, "home"),
    awayStats: summarizeSide(awayRows, "away")
  };
}

function normalizeLabel(candidate) {
  if (!candidate) return "";
  if (candidate.market === "1X2") {
    return { HOME: "Victorie gazde", DRAW: "Egal", AWAY: "Victorie oaspeti" }[candidate.sel] || "1X2";
  }
  if (candidate.market === "Double Chance") return candidate.sel;
  if (candidate.market === "BTTS") return candidate.sel === "YES" ? "Ambele marcheaza" : "Ambele marcheaza - Nu";
  if (String(candidate.market).startsWith("Goals ")) {
    const line = String(candidate.market).replace("Goals ", "");
    return `${candidate.sel === "OVER" ? "Peste" : "Sub"} ${line} goluri`;
  }
  return `${candidate.market} ${candidate.sel}`;
}

function scoreCandidate(candidate) {
  let score = candidate.p;
  if (candidate.market === "1X2" && candidate.sel !== "DRAW") score += 0.06;
  if (candidate.market === "Double Chance" && candidate.sel !== "12") score += 0.08;
  if (candidate.market === "BTTS") score += candidate.sel === "YES" ? 0.05 : -0.18;
  if (candidate.market === "Goals 2.5") score += 0.03;
  if (candidate.market === "Goals 1.5" && candidate.sel === "OVER") score -= 0.12;
  if (candidate.market === "Goals 3.5" && candidate.sel === "UNDER") score -= 0.1;
  return score;
}

function buildCandidates(entry) {
  const goals = estGoals(entry);
  if (!goals) return [];

  const candidates = [];
  const oneXTwo = prob1X2(goals.lh, goals.la);
  const oneXTwoBest = [
    { market: "1X2", sel: "HOME", p: oneXTwo.home },
    { market: "1X2", sel: "DRAW", p: oneXTwo.draw },
    { market: "1X2", sel: "AWAY", p: oneXTwo.away }
  ].sort((a, b) => b.p - a.p)[0];
  if (oneXTwoBest && oneXTwoBest.p >= 0.5) candidates.push(oneXTwoBest);

  const doubleChance = [
    { market: "Double Chance", sel: "1X", p: oneXTwo.home + oneXTwo.draw },
    { market: "Double Chance", sel: "12", p: oneXTwo.home + oneXTwo.away },
    { market: "Double Chance", sel: "X2", p: oneXTwo.draw + oneXTwo.away }
  ].filter((item) => item.sel !== "12" && item.p >= 0.68);
  candidates.push(...doubleChance);

  const pYes = probBTTS(goals.lh, goals.la);
  const pNo = 1 - pYes;
  if (Math.max(pYes, pNo) >= 0.58) {
    candidates.push({ market: "BTTS", sel: pYes >= pNo ? "YES" : "NO", p: Math.max(pYes, pNo) });
  }

  for (const line of GOALS_LINES) {
    const pOver = probTotalOver(line, goals.lt);
    const pUnder = 1 - pOver;
    const best = pOver >= pUnder
      ? { market: `Goals ${line}`, sel: "OVER", p: pOver }
      : { market: `Goals ${line}`, sel: "UNDER", p: pUnder };
    if (best.p >= 0.58) candidates.push(best);
  }

  return candidates
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate), label: normalizeLabel(candidate) }))
    .sort((a, b) => b.score - a.score || b.p - a.p);
}

function evaluate(candidate, match) {
  const home = Number(match.fthg);
  const away = Number(match.ftag);
  const total = home + away;
  if (!Number.isFinite(home) || !Number.isFinite(away)) return false;

  if (candidate.market === "1X2") {
    return (candidate.sel === "HOME" && home > away) ||
      (candidate.sel === "DRAW" && home === away) ||
      (candidate.sel === "AWAY" && home < away);
  }

  if (candidate.market === "Double Chance") {
    return (candidate.sel === "1X" && home >= away) ||
      (candidate.sel === "12" && home !== away) ||
      (candidate.sel === "X2" && home <= away);
  }

  if (candidate.market === "BTTS") {
    const yes = home > 0 && away > 0;
    return (candidate.sel === "YES" && yes) || (candidate.sel === "NO" && !yes);
  }

  if (candidate.market.startsWith("Goals ")) {
    const line = Number(candidate.market.replace("Goals ", ""));
    return candidate.sel === "OVER" ? total > line : total < line;
  }

  return false;
}

const files = fs.readdirSync(SOURCE_HISTORY_DIR).filter((name) => name.endsWith(".json")).sort();

const summary = {
  generatedAtUTC: new Date().toISOString(),
  sampleSize: 0,
  noBet: 0,
  wins: 0,
  losses: 0,
  hitRate: null,
  byMarket: {},
  recentExamples: []
};

for (const file of files) {
  const payload = JSON.parse(fs.readFileSync(path.join(SOURCE_HISTORY_DIR, file), "utf8"));
  const matches = Array.isArray(payload.matches) ? payload.matches.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))) : [];
  const homeHistory = new Map();
  const awayHistory = new Map();

  for (const match of matches) {
    const homePrev = (homeHistory.get(match.home) || []).slice(-5);
    const awayPrev = (awayHistory.get(match.away) || []).slice(-5);

    if (homePrev.length >= 3 && awayPrev.length >= 3) {
      const entry = buildEntry(homePrev, awayPrev);
      const candidates = buildCandidates(entry);
      const primary = candidates[0] || null;
      if (!primary || primary.score < 0.66 || primary.p < 0.58) {
        summary.noBet += 1;
      } else {
        summary.sampleSize += 1;
        const won = evaluate(primary, match);
        if (won) summary.wins += 1;
        else summary.losses += 1;

        const bucket = summary.byMarket[primary.label] || { picks: 0, wins: 0, losses: 0, hitRate: null };
        bucket.picks += 1;
        if (won) bucket.wins += 1;
        else bucket.losses += 1;
        summary.byMarket[primary.label] = bucket;

        if (summary.recentExamples.length < 40) {
          summary.recentExamples.push({
            date: match.date,
            league: payload.name,
            match: `${match.home} vs ${match.away}`,
            pick: primary.label,
            probability: primary.p,
            result: won ? "corect" : "gresit",
            score: `${match.fthg}-${match.ftag}`
          });
        }
      }
    }

    homeHistory.set(match.home, [...(homeHistory.get(match.home) || []), match]);
    awayHistory.set(match.away, [...(awayHistory.get(match.away) || []), match]);
  }
}

summary.hitRate = summary.sampleSize ? Math.round((summary.wins / summary.sampleSize) * 100) : null;

for (const value of Object.values(summary.byMarket)) {
  value.hitRate = value.picks ? Math.round((value.wins / value.picks) * 100) : null;
}

summary.byMarket = Object.fromEntries(
  Object.entries(summary.byMarket)
    .sort((a, b) => (b[1].picks - a[1].picks) || (b[1].hitRate ?? 0) - (a[1].hitRate ?? 0))
);

fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2), "utf8");
console.log(`Saved ${OUTPUT_FILE}`);
