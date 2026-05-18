const fs = require("fs");
const path = require("path");

function readJson(p){ return JSON.parse(fs.readFileSync(p, "utf8")); }
function ensureDir(p){ fs.mkdirSync(p, { recursive: true }); }
const lc = (s) => String(s||"").trim().toLowerCase();

function findFootballDataId(mapCfg, categoryName, tournamentName){
  const maps = mapCfg.mappings || [];
  const c = lc(categoryName);
  const t = lc(tournamentName);

  for (const m of maps){
    const mc = lc(m.match?.categoryName);
    const mt = lc(m.match?.tournamentName);
    if (mc === c && mt === t) return m.footballDataId;
  }
  return null;
}

function loadAliasesFile(p){
  if (!fs.existsSync(p)) return { aliases: {} };
  const obj = readJson(p);
  if (obj && obj.aliases && typeof obj.aliases === "object") return obj;
  return { aliases: {} };
}

function mergeAliases(manualAliases, generatedAliases){
  return { ...generatedAliases, ...manualAliases }; // manual overrides generated
}

// generic cleanup (helps Italy/others)
function normalizeTeamGeneric(name){
  let s = String(name || "").trim();
  if (!s) return s;

  s = s.replace(/[’'.]/g, "");
  // remove leading tokens
  const lead = ["SSC ", "US ", "AS ", "ACF ", "FC ", "CF "];
  for (const p of lead){
    if (s.toLowerCase().startsWith(p.toLowerCase())){
      s = s.slice(p.length).trim();
    }
  }
  // remove trailing tokens
  const drop = [" Calcio"," FC"," CF"," AC"," AFC"," SC"," CFC"," HSC"," OSC"," BC"," FK"," SK"," BK"];
  for (const t of drop){
    if (s.toLowerCase().endsWith(t.trim().toLowerCase())){
      s = s.slice(0, s.length - t.length).trim();
    }
  }
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function stripDiacritics(value){
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenizeTeamName(name){
  const tokenAliases = {
    ath: "atletico",
    sp: "sporting"
  };

  return stripDiacritics(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => tokenAliases[token] || token)
    .filter(Boolean);
}

function compactTeamKey(name){
  return tokenizeTeamName(name).join("");
}

function findFuzzyTeamName(teamStats, name){
  const entries = Object.keys(teamStats || {});
  if (!name || !entries.length) return null;

  const queryTokens = tokenizeTeamName(name);
  const queryCompact = queryTokens.join("");
  if (!queryTokens.length) return null;

  let best = null;

  for (const entry of entries){
    const entryTokens = tokenizeTeamName(entry);
    const entryCompact = entryTokens.join("");
    if (!entryTokens.length) continue;

    const overlap = queryTokens.filter((token) => entryTokens.includes(token)).length;
    const querySubset = queryTokens.every((token) => entryTokens.includes(token));
    const entrySubset = entryTokens.every((token) => queryTokens.includes(token));
    const compactContains = queryCompact && entryCompact && (entryCompact.includes(queryCompact) || queryCompact.includes(entryCompact));

    let score = 0;
    if (queryCompact === entryCompact) score += 4;
    if (querySubset) score += 2.5;
    if (entrySubset) score += 1.25;
    if (compactContains) score += 1;
    score += overlap * 0.7;

    if (overlap === 0) continue;
    if (!best || score > best.score || (score === best.score && entry.length < best.name.length)) {
      best = { name: entry, score };
    }
  }

  return best && best.score >= 2.2 ? best.name : null;
}

function applyAliases(rawName, aliases){
  const raw = String(rawName || "").trim();
  return aliases[raw] || raw;
}

function pickTeamStatsExactOrCI(teamStats, name){
  if (!name) return null;
  if (teamStats[name]) return teamStats[name];
  const key = Object.keys(teamStats).find(k => lc(k) === lc(name));
  return key ? teamStats[key] : null;
}

function pickTeamStatsMulti(statsFile, rawName){
  const teamStats = statsFile?.teamStats || {};
  if (!rawName) return null;

  const attempts = [];
  const pushAttempt = (value, method) => {
    const v = String(value || "").trim();
    if (!v) return;
    if (attempts.some((item) => lc(item.value) === lc(v))) return;
    attempts.push({ value: v, method });
  };

  pushAttempt(rawName, "raw");
  const normalizedRaw = normalizeTeamGeneric(rawName);
  if (normalizedRaw && normalizedRaw !== rawName) {
    pushAttempt(normalizedRaw, "normalized");
  }

  const originalRaw = arguments[2];
  if (originalRaw && String(originalRaw).trim() && lc(originalRaw) !== lc(rawName)) {
    pushAttempt(originalRaw, "original");
    const normalizedOriginal = normalizeTeamGeneric(originalRaw);
    if (normalizedOriginal && normalizedOriginal !== originalRaw) {
      pushAttempt(normalizedOriginal, "original-normalized");
    }
  }

  for (const attempt of attempts) {
    const found = pickTeamStatsExactOrCI(teamStats, attempt.value);
    if (found) return { stats: found, pickedName: attempt.value, method: attempt.method };
  }

  for (const attempt of attempts) {
    const fuzzyName = findFuzzyTeamName(teamStats, attempt.value);
    if (fuzzyName && teamStats[fuzzyName]) {
      return { stats: teamStats[fuzzyName], pickedName: fuzzyName, method: `${attempt.method}-fuzzy` };
    }
  }

  return null;
}

function getAllStatsIds(){
  const dir = path.join("data", "stats");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/i, ""))
    .sort();
}

function main(){
  const mapPath = path.join("scripts","league-map.json");
  const matchesPath = path.join("data","ui","matches.json");

  if (!fs.existsSync(mapPath)) throw new Error("Missing scripts/league-map.json");
  if (!fs.existsSync(matchesPath)) throw new Error("Missing data/ui/matches.json");

  const mapCfg = readJson(mapPath);
  const matches = readJson(matchesPath).matches || [];

  const manual = loadAliasesFile(path.join("scripts", "team-aliases.json")).aliases;
  const generated = loadAliasesFile(path.join("scripts", "team-aliases.generated.json")).aliases;
  const aliases = mergeAliases(manual, generated);
  const allStatsIds = getAllStatsIds();

  const out = {
    generatedAtUTC: new Date().toISOString(),
    lookback: null,
    aliasesUsed: Object.keys(aliases).length,
    byFixtureId: {}
  };

  const statsCache = new Map();
  const loadStatsFile = (fdId) => {
    if (!statsCache.has(fdId)){
      const p = path.join("data","stats",`${fdId}.json`);
      statsCache.set(fdId, fs.existsSync(p) ? readJson(p) : null);
    }
    return statsCache.get(fdId);
  };

  function pickTeamStatsFromDomesticFallback(rawName, originalRaw){
    for (const statsId of allStatsIds) {
      if (statsId === "UEFA") continue;
      const statsFile = loadStatsFile(statsId);
      if (!statsFile) continue;
      const picked = pickTeamStatsMulti(statsFile, rawName, originalRaw);
      if (picked) {
        return { ...picked, fallbackLeagueId: statsId };
      }
    }
    return null;
  }

  for (const m of matches){
    const fixtureId = String(m.fixtureId);
    const categoryName = m.categoryName || "";
    const tournamentName = m.tournamentName || "";

    const fdId = findFootballDataId(mapCfg, categoryName, tournamentName);
    const homeRaw = String(m.home || "").trim();
    const awayRaw = String(m.away || "").trim();

    // Apply aliases (manual + generated). IMPORTANT: don't normalize yet.
    const homeAliased = applyAliases(homeRaw, aliases);
    const awayAliased = applyAliases(awayRaw, aliases);

    if (!fdId){
      out.byFixtureId[fixtureId] = {
        footballDataId: null,
        note: "No league mapping",
        categoryName,
        tournamentName,
        homeRaw,
        awayRaw,
        home: homeAliased,
        away: awayAliased
      };
      continue;
    }

    const statsFile = loadStatsFile(fdId);
    out.lookback = out.lookback ?? statsFile?.lookback ?? null;
    if (!statsFile){
      out.byFixtureId[fixtureId] = {
        footballDataId: fdId,
        note: "Missing data/stats file",
        categoryName,
        tournamentName,
        homeRaw,
        awayRaw,
        home: homeAliased,
        away: awayAliased
      };
      continue;
    }

    let hPick = pickTeamStatsMulti(statsFile, homeAliased, homeRaw);
    let aPick = pickTeamStatsMulti(statsFile, awayAliased, awayRaw);

    if (fdId === "UEFA") {
      if (!hPick) hPick = pickTeamStatsFromDomesticFallback(homeAliased, homeRaw);
      if (!aPick) aPick = pickTeamStatsFromDomesticFallback(awayAliased, awayRaw);
    }

    let note = null;
    if (!hPick || !aPick){
      const miss = [];
      if (!hPick) miss.push(`home team not found in stats: "${homeAliased}"`);
      if (!aPick) miss.push(`away team not found in stats: "${awayAliased}"`);
      note = miss.join(" | ");
    }

    out.byFixtureId[fixtureId] = {
      footballDataId: fdId,
      categoryName,
      tournamentName,
      homeRaw,
      awayRaw,
      home: homeAliased,
      away: awayAliased,
      homePicked: hPick?.pickedName || null,
      awayPicked: aPick?.pickedName || null,
      homePickMethod: hPick?.method || null,
      awayPickMethod: aPick?.method || null,
      homeFallbackLeagueId: hPick?.fallbackLeagueId || null,
      awayFallbackLeagueId: aPick?.fallbackLeagueId || null,
      homeStats: hPick?.stats || null,
      awayStats: aPick?.stats || null,
      note
    };
  }

  ensureDir(path.join("data","ui"));
  fs.writeFileSync(path.join("data","ui","history_stats.json"), JSON.stringify(out, null, 2), "utf8");
  console.log("Wrote data/ui/history_stats.json");
}

main();
