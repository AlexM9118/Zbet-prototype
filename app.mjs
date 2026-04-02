import { getJson, fmtOdds, fmtDayLong, fmtTime, pct01 } from "./js/utils.mjs";
import { buildMatchRecommendationPair, getCandidatesForMatch } from "./js/recommendations.mjs";

const TEAM_DISPLAY_ALIASES = {
  "Fotbal Club FCSB": "FCSB"
};

const state = {
  matches: [],
  historyByFixtureId: {},
  selectedLeague: "",
  selectedFixtureId: "",
  leagueMode: false
};

const el = (id) => document.getElementById(id);

function displayTeamName(name) {
  const raw = String(name || "").trim();
  return TEAM_DISPLAY_ALIASES[raw] || raw;
}

function groupMatchesByLeague(matches) {
  const map = new Map();
  for (const match of matches) {
    const id = String(match.tournamentId);
    if (!map.has(id)) {
      map.set(id, {
        id,
        label: `${match.categoryName} • ${match.tournamentName}`,
        matches: []
      });
    }
    map.get(id).matches.push(match);
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function getHistEntry(fixtureId) {
  return state.historyByFixtureId[String(fixtureId)] || null;
}

function findMatchByFixtureId(fixtureId) {
  return state.matches.find((match) => String(match.fixtureId) === String(fixtureId)) || null;
}

function getRecommendedPair(match) {
  return buildMatchRecommendationPair(match, getHistEntry) || { primary: null, secondary: null };
}

function bestAvailableMarkets(match) {
  const candidates = getCandidatesForMatch(match, getHistEntry)
    .filter((entry) => Number.isFinite(Number(entry?.bookOdds)))
    .sort((a, b) => (b?.confidence?.score || 0) - (a?.confidence?.score || 0));
  return candidates.slice(0, 8);
}

function formatLeagueMatches() {
  const selected = groupMatchesByLeague(state.matches).find((league) => league.id === state.selectedLeague);
  const list = el("leagueMatches");
  const subtitle = el("leagueSubtitle");
  const count = el("leagueMatchCount");
  const title = el("leagueTitle");
  if (!selected) {
    title.textContent = "Liga selectata";
    subtitle.textContent = "Meciurile vor aparea aici dupa selectie.";
    count.textContent = "0 meciuri";
    list.innerHTML = "";
    return;
  }

  title.textContent = selected.label;
  subtitle.textContent = state.leagueMode
    ? "Vezi toate meciurile din liga, cu acces rapid la analiza."
    : "Selecteaza un meci pentru analiza detaliata.";
  count.textContent = `${selected.matches.length} meciuri`;

  list.innerHTML = selected.matches.map((match) => {
    const active = String(match.fixtureId) === String(state.selectedFixtureId) ? " active" : "";
    return `
      <button class="league-item${active}" data-fixture-id="${String(match.fixtureId)}">
        <div class="league-item-match">${displayTeamName(match.home)} vs ${displayTeamName(match.away)}</div>
        <div class="league-item-meta">${fmtTime(match.startTime)} • ${match.hasOdds ? "cote live" : "fara cote live"}</div>
      </button>
    `;
  }).join("");

  list.querySelectorAll("[data-fixture-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedFixtureId = button.getAttribute("data-fixture-id");
      state.leagueMode = false;
      syncSelectors();
      formatLeagueMatches();
      renderAnalysis();
    });
  });
}

function renderPick(container, pick, fallbackTitle) {
  if (!pick) {
    container.innerHTML = `<div class="pick-label">—</div><div class="pick-copy">Nu exista inca o recomandare suficient de buna pentru acest slot.</div>`;
    return;
  }
  container.innerHTML = `
    <div class="pick-label">${pick.displayLabel || fallbackTitle}</div>
    <div class="pick-row">
      <div class="pick-chip">${pick.confidence?.score != null ? pct01(pick.confidence.score) : "—"}</div>
      <div class="muted">${Number.isFinite(Number(pick.bookOdds)) ? `cota ${fmtOdds(pick.bookOdds)}` : "fara cota"}</div>
    </div>
    <div class="pick-copy">${pick.reason || "Selectie recomandata pe baza modelului si a pietei."}</div>
  `;
}

function renderMarkets(match, pair) {
  const candidates = bestAvailableMarkets(match);
  const grid = el("marketsGrid");
  const selectedLabels = new Set([pair?.primary?.displayLabel, pair?.secondary?.displayLabel].filter(Boolean));
  grid.innerHTML = candidates.map((item) => {
    const probability = Number(item?.confidence?.score);
    const width = Number.isFinite(probability) ? Math.max(8, Math.min(100, probability * 100)) : 8;
    return `
      <article class="market-card">
        <div class="market-title">${selectedLabels.has(item.displayLabel) ? "Piata recomandata" : "Piata disponibila"}</div>
        <div class="market-value">${item.displayLabel}</div>
        <div class="market-meta">${Number.isFinite(Number(item.bookOdds)) ? `cota ${fmtOdds(item.bookOdds)}` : "fara cota live"}${Number.isFinite(probability) ? ` • ${pct01(probability)}` : ""}</div>
        <div class="prob-bar"><span style="width:${width}%"></span></div>
      </article>
    `;
  }).join("");
}

function renderForm(match) {
  const entry = getHistEntry(match.fixtureId);
  const formGrid = el("formGrid");
  const home = entry?.homeStats;
  const away = entry?.awayStats;
  formGrid.innerHTML = `
    <article class="form-card home">
      <div class="form-title">${displayTeamName(match.home)} • ultimele 5</div>
      <div class="form-stat">Goluri marcate: ${home?.homeGF ?? "—"}</div>
      <div class="form-stat">Goluri primite: ${home?.homeGA ?? "—"}</div>
      <div class="form-stat">Cornere: ${home?.homeCornersFor ?? "—"}</div>
      <div class="form-stat">Cartonase: ${home?.homeYCFor ?? "—"}</div>
    </article>
    <article class="form-card away">
      <div class="form-title">${displayTeamName(match.away)} • ultimele 5</div>
      <div class="form-stat">Goluri marcate: ${away?.awayGF ?? "—"}</div>
      <div class="form-stat">Goluri primite: ${away?.awayGA ?? "—"}</div>
      <div class="form-stat">Cornere: ${away?.awayCornersFor ?? "—"}</div>
      <div class="form-stat">Cartonase: ${away?.awayYCFor ?? "—"}</div>
    </article>
  `;
}

function renderReasons(match, pair) {
  const reasons = [];
  if (pair?.primary?.displayLabel) reasons.push(`Best bet: ${pair.primary.displayLabel} este concluzia principala a analizei pentru ${displayTeamName(match.home)} vs ${displayTeamName(match.away)}.`);
  if (pair?.secondary?.displayLabel) reasons.push(`Plan B: ${pair.secondary.displayLabel} ramane vizibil ca alternativa, nu ca recomandare dominanta.`);
  const hist = getHistEntry(match.fixtureId);
  if (hist?.homeStats && hist?.awayStats) {
    reasons.push("Forma celor doua echipe este disponibila si poate fi extinsa doar la cerere, ca sa nu incarce ecranul principal.");
  }
  reasons.push("Toate pietele pot fi afisate cu cote si o bara de probabilitate, ca sa vezi tabloul complet al meciului.");
  el("reasonList").innerHTML = reasons.map((reason) => `<div class="reason-item">${reason}</div>`).join("");
}

function renderHero(match) {
  const leagueLabel = `${match.categoryName} • ${match.tournamentName}`;
  el("matchHero").innerHTML = `
    <div class="match-hero-title">${displayTeamName(match.home)} vs ${displayTeamName(match.away)}</div>
    <div class="match-hero-meta">${fmtDayLong(match.day)} • ${fmtTime(match.startTime)} • ${leagueLabel}</div>
    <div class="match-hero-badges">
      <span class="pill">${match.hasOdds ? "Cote live disponibile" : "Fara cote live"}</span>
      <span class="pill">${state.leagueMode ? "Mod: toate meciurile din liga" : "Mod: analiza singulara"}</span>
    </div>
  `;
}

function renderAnalysis() {
  const match = findMatchByFixtureId(state.selectedFixtureId);
  if (!match) return;
  const pair = getRecommendedPair(match);
  renderHero(match);
  renderPick(el("bestBetBody"), pair.primary, "Best bet");
  renderPick(el("planBBody"), pair.secondary, "Plan B");
  renderMarkets(match, pair);
  renderForm(match);
  renderReasons(match, pair);
}

function syncSelectors() {
  el("leagueSelect").value = state.selectedLeague;
  el("matchSelect").value = state.selectedFixtureId;
}

function populateControls() {
  const leagues = groupMatchesByLeague(state.matches);
  el("leagueSelect").innerHTML = leagues
    .map((league) => `<option value="${league.id}">${league.label}</option>`)
    .join("");

  const selected = leagues.find((league) => league.id === state.selectedLeague) || leagues[0];
  if (!selected) return;
  state.selectedLeague = selected.id;

  el("matchSelect").innerHTML = selected.matches
    .map((match) => `<option value="${String(match.fixtureId)}">${displayTeamName(match.home)} vs ${displayTeamName(match.away)}</option>`)
    .join("");

  if (!selected.matches.some((match) => String(match.fixtureId) === String(state.selectedFixtureId))) {
    const preferred = selected.matches.find((match) => displayTeamName(match.home) === "FC Botosani" && displayTeamName(match.away) === "FCSB");
    state.selectedFixtureId = String((preferred || selected.matches[0])?.fixtureId || "");
  }

  syncSelectors();

  el("leagueSelect").addEventListener("change", () => {
    state.selectedLeague = el("leagueSelect").value;
    state.leagueMode = false;
    populateControls();
    formatLeagueMatches();
    renderAnalysis();
  });

  el("matchSelect").addEventListener("change", () => {
    state.selectedFixtureId = el("matchSelect").value;
    state.leagueMode = false;
    formatLeagueMatches();
    renderAnalysis();
  });
}

function bindActions() {
  el("analyzeMatchBtn").addEventListener("click", () => {
    state.leagueMode = false;
    formatLeagueMatches();
    renderAnalysis();
  });

  el("analyzeLeagueBtn").addEventListener("click", () => {
    state.leagueMode = true;
    formatLeagueMatches();
    renderAnalysis();
  });

  el("toggleMarketsBtn").addEventListener("click", () => {
    const panel = el("marketsPanel");
    panel.hidden = !panel.hidden;
    el("toggleMarketsBtn").textContent = panel.hidden ? "Afiseaza toate pietele" : "Ascunde toate pietele";
  });

  el("toggleFormBtn").addEventListener("click", () => {
    const panel = el("formPanel");
    panel.hidden = !panel.hidden;
    el("toggleFormBtn").textContent = panel.hidden ? "Afiseaza forma si comparatia" : "Ascunde forma si comparatia";
  });
}

async function init() {
  const matchesPayload = await getJson("./data/ui/matches.json");
  const historyPayload = await getJson("./data/ui/history_stats.json");
  state.matches = (matchesPayload.matches || []).map((match) => ({
    ...match,
    home: displayTeamName(match.home),
    away: displayTeamName(match.away)
  }));
  state.historyByFixtureId = historyPayload.byFixtureId || {};

  const leagues = groupMatchesByLeague(state.matches);
  const defaultLeague = leagues.find((league) => league.label === "Romania • Superliga") || leagues[0];
  state.selectedLeague = defaultLeague?.id || "";
  const preferred = defaultLeague?.matches.find((match) => match.home === "FC Botosani" && match.away === "FCSB");
  state.selectedFixtureId = String((preferred || defaultLeague?.matches[0])?.fixtureId || "");

  populateControls();
  bindActions();
  formatLeagueMatches();
  renderAnalysis();
}

init();
