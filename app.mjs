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
  leagueMode: false,
  analysisVisible: false,
  searchTerm: ""
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

function toDayStamp(day) {
  const time = new Date(`${day}T12:00:00`).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getCurrentRoundMatches(matches) {
  if (!Array.isArray(matches) || !matches.length) return [];
  const uniqueDays = [...new Set(matches.map((match) => String(match.day || "")).filter(Boolean))]
    .sort((a, b) => toDayStamp(a) - toDayStamp(b));
  if (!uniqueDays.length) return matches;

  const roundDays = [uniqueDays[0]];
  for (let index = 1; index < uniqueDays.length; index += 1) {
    const prev = toDayStamp(uniqueDays[index - 1]);
    const current = toDayStamp(uniqueDays[index]);
    const gapDays = Math.round((current - prev) / 86400000);
    if (gapDays > 2) break;
    roundDays.push(uniqueDays[index]);
  }

  const roundSet = new Set(roundDays);
  return matches.filter((match) => roundSet.has(String(match.day || "")));
}

function renderSearchResults() {
  const panel = el("searchResults");
  const term = String(state.searchTerm || "").trim().toLowerCase();
  if (!term) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }

  const baseMatches = state.selectedLeague
    ? (groupMatchesByLeague(state.matches).find((league) => league.id === state.selectedLeague)?.matches || [])
    : state.matches;

  const results = baseMatches
    .filter((match) => {
      const hay = `${displayTeamName(match.home)} ${displayTeamName(match.away)} ${match.categoryName} ${match.tournamentName}`.toLowerCase();
      return hay.includes(term);
    })
    .sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")))
    .slice(0, 8);

  if (!results.length) {
    panel.hidden = false;
    panel.innerHTML = `<div class="reason-item">Nu exista meciuri disponibile pentru cautarea ta.</div>`;
    return;
  }

  panel.hidden = false;
  panel.innerHTML = results.map((match) => `
    <button class="search-item" data-search-fixture-id="${String(match.fixtureId)}" data-search-league-id="${String(match.tournamentId)}">
      <div class="league-item-match">${displayTeamName(match.home)} vs ${displayTeamName(match.away)}</div>
      <div class="search-item-meta">${fmtDayLong(match.day)} • ${fmtTime(match.startTime)} • ${match.categoryName} • ${match.tournamentName}</div>
    </button>
  `).join("");

  panel.querySelectorAll("[data-search-fixture-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedLeague = button.getAttribute("data-search-league-id") || "";
      state.selectedFixtureId = button.getAttribute("data-search-fixture-id") || "";
      state.leagueMode = false;
      state.analysisVisible = true;
      state.searchTerm = "";
      el("searchInput").value = "";
      el("searchOverlay").hidden = true;
      populateControls();
      renderSearchResults();
      formatLeagueMatches();
      renderAnalysis();
    });
  });
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
  const panel = el("leaguePanel");
  if (!state.leagueMode || !state.selectedLeague) {
    panel.hidden = true;
    el("leagueMatches").innerHTML = "";
    return;
  }

  panel.hidden = false;
  const selected = groupMatchesByLeague(state.matches).find((league) => league.id === state.selectedLeague);
  const list = el("leagueMatches");
  const subtitle = el("leagueSubtitle");
  const count = el("leagueMatchCount");
  const title = el("leagueTitle");
  if (!selected) {
    title.textContent = "Nicio competitie selectata";
    subtitle.textContent = "Alege competitia ca sa vezi toate meciurile disponibile.";
    count.textContent = "0 meciuri";
    list.innerHTML = "";
    return;
  }

  const roundMatches = getCurrentRoundMatches(selected.matches);
  title.textContent = selected.label;
  subtitle.textContent = "Meciurile disponibile din etapa curenta.";
  count.textContent = `${roundMatches.length} meciuri`;

  list.innerHTML = roundMatches.map((match) => {
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
      state.analysisVisible = true;
      syncSelectors();
      formatLeagueMatches();
      renderAnalysis();
    });
  });
}

function renderAnalysisEmpty() {
  el("matchHero").innerHTML = `
    <div class="match-hero-title">Selecteaza un meci sau analizeaza toata competitia</div>
    <div class="match-hero-meta">Prototipul nu afiseaza automat o analiza implicita. Alegerea iti apartine.</div>
    <div class="match-hero-badges">
      <span class="pill">1. Alege competitia</span>
      <span class="pill">2. Alege meciul sau toate meciurile</span>
    </div>
  `;
  el("bestBetBody").innerHTML = `<div class="pick-label">—</div><div class="pick-copy">Nu exista analiza activa pana nu selectezi explicit un meci.</div>`;
  el("planBBody").innerHTML = `<div class="pick-label">—</div><div class="pick-copy">Plan B apare doar dupa ce pornesti analiza pentru un meci.</div>`;
  el("marketsGrid").innerHTML = "";
  el("formGrid").innerHTML = "";
  el("reasonList").innerHTML = "";
  el("reasonList").hidden = true;
  el("toggleReasonsBtn").textContent = "Afiseaza justificarea";
  el("marketsPanel").hidden = true;
  el("toggleMarketsBtn").textContent = "Afiseaza toate pietele";
  el("formPanel").hidden = true;
  el("toggleFormBtn").textContent = "Afiseaza forma si comparatia";
}

function renderPick(container, pick, fallbackTitle) {
  if (!pick) {
    container.innerHTML = `<div class="pick-label">—</div><div class="pick-copy">Nu exista inca o recomandare suficient de buna pentru acest slot.</div>`;
    return;
  }
  const probability = Number(pick.confidence?.score);
  const probabilityPct = Number.isFinite(probability) ? Math.round(probability * 100) : null;
  const barWidth = probabilityPct == null ? 50 : Math.max(10, Math.min(100, probabilityPct));
  container.innerHTML = `
    <div class="pick-label">${pick.displayLabel || fallbackTitle}</div>
    <div class="pick-row">
      <div class="pick-chip">${pick.confidence?.score != null ? pct01(pick.confidence.score) : "—"}</div>
      <div class="muted">${Number.isFinite(Number(pick.bookOdds)) ? `cota ${fmtOdds(pick.bookOdds)}` : "fara cota"}</div>
    </div>
    <div class="pick-meter" aria-hidden="true">
      <span class="pick-meter-good" style="width:${barWidth}%"></span>
      <span class="pick-meter-bad" style="width:${100 - barWidth}%"></span>
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
  if (!state.analysisVisible || !state.selectedFixtureId) {
    renderAnalysisEmpty();
    return;
  }
  const match = findMatchByFixtureId(state.selectedFixtureId);
  if (!match) {
    renderAnalysisEmpty();
    return;
  }
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
  el("leagueSelect").innerHTML = [
    `<option value="">Alege competitia</option>`,
    ...leagues.map((league) => `<option value="${league.id}">${league.label}</option>`)
  ]
    .join("");

  const selected = leagues.find((league) => league.id === state.selectedLeague);
  if (!selected) {
    el("matchSelect").innerHTML = `<option value="">Alege mai intai competitia</option>`;
    el("matchSelect").value = "";
    el("matchSelectHint").textContent = "Selecteaza o competitie ca sa vezi meciurile din etapa curenta.";
    return;
  }

  const roundMatches = getCurrentRoundMatches(selected.matches);
  const selectedMatch = selected.matches.find((match) => String(match.fixtureId) === String(state.selectedFixtureId)) || null;
  const optionMatches = selectedMatch && !roundMatches.some((match) => String(match.fixtureId) === String(selectedMatch.fixtureId))
    ? [selectedMatch, ...roundMatches]
    : roundMatches;
  el("matchSelect").innerHTML = [
    `<option value="">Alege meciul</option>`,
    ...optionMatches.map((match) => `<option value="${String(match.fixtureId)}">${displayTeamName(match.home)} vs ${displayTeamName(match.away)}</option>`)
  ].join("");
  el("matchSelectHint").textContent = `${roundMatches.length} meciuri disponibile in etapa curenta pentru competitia selectata.`;

  if (!optionMatches.some((match) => String(match.fixtureId) === String(state.selectedFixtureId))) {
    state.selectedFixtureId = "";
  }

  syncSelectors();
}

function bindActions() {
  el("leagueSelect").addEventListener("change", () => {
    state.selectedLeague = el("leagueSelect").value;
    state.selectedFixtureId = "";
    state.leagueMode = false;
    state.analysisVisible = false;
    populateControls();
    renderSearchResults();
    formatLeagueMatches();
    renderAnalysis();
  });

  el("matchSelect").addEventListener("change", () => {
    state.selectedFixtureId = el("matchSelect").value;
    state.leagueMode = false;
    state.analysisVisible = Boolean(state.selectedFixtureId);
    renderSearchResults();
    formatLeagueMatches();
    renderAnalysis();
  });

  el("searchInput").addEventListener("input", () => {
    state.searchTerm = el("searchInput").value;
    renderSearchResults();
  });

  el("searchToggleBtn").addEventListener("click", () => {
    const overlay = el("searchOverlay");
    overlay.hidden = !overlay.hidden;
    if (!overlay.hidden) {
      el("searchInput").focus();
    } else {
      state.searchTerm = "";
      el("searchInput").value = "";
      renderSearchResults();
    }
  });

  el("analyzeMatchBtn").addEventListener("click", () => {
    if (!state.selectedFixtureId) return;
    state.leagueMode = false;
    state.analysisVisible = true;
    formatLeagueMatches();
    renderAnalysis();
  });

  el("analyzeLeagueBtn").addEventListener("click", () => {
    if (!state.selectedLeague) return;
    state.leagueMode = true;
    state.analysisVisible = false;
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

  el("toggleReasonsBtn").addEventListener("click", () => {
    const panel = el("reasonList");
    panel.hidden = !panel.hidden;
    el("toggleReasonsBtn").textContent = panel.hidden ? "Afiseaza justificarea" : "Ascunde justificarea";
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
  state.selectedLeague = "";
  state.selectedFixtureId = "";
  state.analysisVisible = false;
  state.searchTerm = "";

  populateControls();
  bindActions();
  renderSearchResults();
  formatLeagueMatches();
  renderAnalysis();
}

init();
