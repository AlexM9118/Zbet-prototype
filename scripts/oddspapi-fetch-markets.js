const fs = require("fs");
const path = require("path");

const API_BASE = "https://api.oddspapi.io";

function ensureDir(p){ fs.mkdirSync(p, { recursive: true }); }

async function fetchText(url){
  const r = await fetch(url, { headers: { "user-agent": "alexaibet/1.0" } });
  const text = await r.text();
  return { status: r.status, ok: r.ok, text };
}

async function main(){
  const key = process.env.ODDSPAPI_KEY;
  if (!key) throw new Error("Missing ODDSPAPI_KEY");

  const language = process.env.LANGUAGE || "en";
  const url =
    `${API_BASE}/v4/markets` +
    `?language=${encodeURIComponent(language)}` +
    `&apiKey=${encodeURIComponent(key)}`;

  ensureDir("data");

  const { status, ok, text } = await fetchText(url);
  fs.writeFileSync(path.join("data", "oddspapi_markets_raw.txt"), text, "utf8");

  if (!ok) {
    throw new Error(`OddsPapi markets request failed (HTTP ${status}). See data/oddspapi_markets_raw.txt`);
  }

  const data = JSON.parse(text);
  fs.writeFileSync(path.join("data", "oddspapi_markets.json"), JSON.stringify(data, null, 2), "utf8");

  console.log(`Saved data/oddspapi_markets.json entries=${Array.isArray(data) ? data.length : 0}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
