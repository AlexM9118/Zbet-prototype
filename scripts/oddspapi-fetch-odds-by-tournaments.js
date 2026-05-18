const fs = require("fs");
const path = require("path");

const API_BASE = "https://api.oddspapi.io";
const MAX_IDS_PER_REQ = 5;
const SLEEP_MS = 1200; // docs mention 1000ms cooldown; keep a bit higher

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function chunk(arr, size){
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchText(url){
  const r = await fetch(url, { headers: { "user-agent": "cps-oracle-pro/1.0" }});
  const text = await r.text();
  return { status: r.status, ok: r.ok, text };
}

function ensureDir(p){ fs.mkdirSync(p, { recursive: true }); }

function parseIds(s){
  return String(s || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

function loadIdsFromConfig(){
  const cfgPath = path.join("scripts", "oddspapi-tournament-ids.json");
  if (!fs.existsSync(cfgPath)) return [];
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  if (!Array.isArray(cfg.tournamentIds)) return [];
  return cfg.tournamentIds.map((id) => String(id).trim()).filter(Boolean);
}

function readJsonIfExists(filePath){
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function main(){
  const key = process.env.ODDSPAPI_KEY;
  if (!key) throw new Error("Missing ODDSPAPI_KEY");

  const bookmaker = process.env.BOOKMAKER || "superbet";
  const oddsFormat = process.env.ODDS_FORMAT || "decimal";
  const verbosity = process.env.VERBOSITY || "1";

  const envIds = parseIds(process.env.TOURNAMENT_IDS || "");
  const cfgIds = loadIdsFromConfig();
  const ids = Array.from(new Set(envIds.length ? envIds : cfgIds));

  if (!ids.length) throw new Error("No tournamentIds provided.");

  const batches = chunk(ids, MAX_IDS_PER_REQ);
  console.log(`TournamentIds: ${ids.length} -> ${batches.length} batch(es) of max ${MAX_IDS_PER_REQ}`);

  ensureDir("data");
  ensureDir(path.join("data", "oddspapi_odds_parts"));

  const allFixtures = [];
  const batchSummaries = [];

  for (let i = 0; i < batches.length; i++){
    const batch = batches[i];
    const batchIds = batch.join(",");

    const url =
      `${API_BASE}/v4/odds-by-tournaments` +
      `?bookmaker=${encodeURIComponent(bookmaker)}` +
      `&tournamentIds=${encodeURIComponent(batchIds)}` +
      `&oddsFormat=${encodeURIComponent(oddsFormat)}` +
      `&verbosity=${encodeURIComponent(verbosity)}` +
      `&apiKey=${encodeURIComponent(key)}`;

    console.log(`Batch ${i+1}/${batches.length} ids=[${batchIds}]`);
    console.log("Request:", url.replace(key, "***"));

    const { status, ok, text } = await fetchText(url);
    console.log("HTTP:", status);

    const rawPath = path.join("data", "oddspapi_odds_parts", `part_${String(i+1).padStart(2,"0")}_raw.txt`);
    fs.writeFileSync(rawPath, text, "utf8");

    if (!ok){
      console.log("Error body (first 500 chars):");
      console.log(text.slice(0, 500));
      throw new Error(`OddsPapi request failed for batch ${i+1} (HTTP ${status}). See ${rawPath}`);
    }

    const data = JSON.parse(text);
    const partPath = path.join("data", "oddspapi_odds_parts", `part_${String(i+1).padStart(2,"0")}.json`);
    fs.writeFileSync(partPath, JSON.stringify(data, null, 2), "utf8");

    const count = Array.isArray(data) ? data.length : 0;
    batchSummaries.push({ batch: i+1, tournamentIds: batch, fixtures: count, file: partPath });

    if (Array.isArray(data)) allFixtures.push(...data);

    // cooldown
    if (i < batches.length - 1) await sleep(SLEEP_MS);
  }

  // De-dupe fixtures by fixtureId (if overlaps ever happen)
  const byFixtureId = new Map();
  for (const f of allFixtures){
    if (!f || !f.fixtureId) continue;
    byFixtureId.set(f.fixtureId, f);
  }
  const merged = Array.from(byFixtureId.values());

  let finalFixtures = merged;
  let finalTournamentIds = ids;

  const isPartialRefresh = envIds.length > 0 && cfgIds.length > 0 && ids.length < cfgIds.length;
  if (isPartialRefresh){
    const existingFixtures = readJsonIfExists(path.join("data", "oddspapi_odds.json"));
    if (Array.isArray(existingFixtures) && existingFixtures.length){
      const refreshIds = new Set(ids.map(String));
      const carriedFixtures = existingFixtures.filter((fixture) => !refreshIds.has(String(fixture?.tournamentId ?? "")));
      const byFixtureIdMerged = new Map();
      for (const fixture of carriedFixtures){
        if (!fixture || !fixture.fixtureId) continue;
        byFixtureIdMerged.set(String(fixture.fixtureId), fixture);
      }
      for (const fixture of merged){
        if (!fixture || !fixture.fixtureId) continue;
        byFixtureIdMerged.set(String(fixture.fixtureId), fixture);
      }
      finalFixtures = Array.from(byFixtureIdMerged.values());
      finalTournamentIds = cfgIds;
      console.log(`Partial refresh detected. Keeping ${carriedFixtures.length} fixtures from existing snapshot and replacing ${merged.length} fetched fixtures.`);
    }
  }

  fs.writeFileSync(path.join("data", "oddspapi_odds.json"), JSON.stringify(finalFixtures, null, 2), "utf8");
  fs.writeFileSync(path.join("data", "oddspapi_odds_index.json"), JSON.stringify({
    generatedAtUTC: new Date().toISOString(),
    bookmaker,
    oddsFormat,
    verbosity,
    tournamentIds: finalTournamentIds,
    batches: batchSummaries,
    fixturesTotal: finalFixtures.length
  }, null, 2), "utf8");

  console.log(`Saved data/oddspapi_odds.json fixtures=${finalFixtures.length}`);
  console.log(`Saved data/oddspapi_odds_index.json batches=${batches.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
