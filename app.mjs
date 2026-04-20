import { getJson, fmtOdds, fmtDayLong, fmtTime, pct01, escapeHtml } from "./js/utils.mjs";
import { buildMatchRecommendationPair, getCandidatesForMatch, getRecommendationConfidence } from "./js/recommendations.mjs";

const TEAM_DISPLAY_ALIASES = {
  "Fotbal Club FCSB": "FCSB"
};

const state = {
  matches: [],
  catalogLeagues: [],
  historyByFixtureId: {},
  backtest: null,
  matchesGeneratedAt: "",
  latestAvailableDay: "",
  selectedLeague: "",
  selectedFixtureId: "",
  activeTab: "analyzer",
  leagueMode: false,
  analysisVisible: false,
  searchTerm: ""
};

let pendingWorker = null;
const UPDATE_BANNER_DISMISSED_KEY = "zbet-prototype-update-dismissed";
const APP_VERSION = "13";

const el = (id) => document.getElementById(id);

function showUpdateBanner() {
  const banner = el("updateBanner");
  if (!banner || !pendingWorker) return;
  if (window.localStorage.getItem(UPDATE_BANNER_DISMISSED_KEY) === "true") return;
  banner.hidden = false;
}

function hideUpdateBanner() {
  const banner = el("updateBanner");
  if (banner) banner.hidden = true;
}

function animatePanel(element) {
  if (!element) return;
  element.classList.remove("panel-refresh");
  window.requestAnimationFrame(() => {
    element.classList.add("panel-refresh");
  });
}

function animatePanelSwap(element) {
  if (!element) return;
  element.classList.remove("panel-enter");
  window.requestAnimationFrame(() => {
    element.classList.add("panel-enter");
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.register(`./sw.js?v=${APP_VERSION}`);

  const trackInstalling = (worker) => {
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        pendingWorker = worker;
        window.localStorage.removeItem(UPDATE_BANNER_DISMISSED_KEY);
        showUpdateBanner();
      }
    });
  };

  trackInstalling(registration.installing);
  registration.addEventListener("updatefound", () => trackInstalling(registration.installing));

  if (registration.waiting) {
    pendingWorker = registration.waiting;
    window.localStorage.removeItem(UPDATE_BANNER_DISMISSED_KEY);
    showUpdateBanner();
  }

  registration.update().catch(() => {});

  window.addEventListener("pageshow", () => {
    registration.update().catch(() => {});
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      registration.update().catch(() => {});
    }
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.localStorage.removeItem(UPDATE_BANNER_DISMISSED_KEY);
    window.location.reload();
  });
}

function bindPress(id, handler) {
  const node = el(id);
  if (!node) return;

  let touchHandledUntil = 0;

  node.addEventListener("pointerup", (event) => {
    if (event.pointerType === "mouse") return;
    touchHandledUntil = Date.now() + 450;
    event.preventDefault();
    handler(event);
  });

  node.addEventListener("click", (event) => {
    if (Date.now() < touchHandledUntil) return;
    handler(event);
  });
}

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

function getLeagueCatalog() {
  const grouped = groupMatchesByLeague(state.matches);
  const groupedMap = new Map(grouped.map((league) => [league.id, league]));

  const catalog = Array.isArray(state.catalogLeagues) && state.catalogLeagues.length
    ? state.catalogLeagues.map((league) => {
      const id = String(league.id ?? league.tournamentId ?? "");
      const fallbackLabel = [league.categoryName, league.name].filter(Boolean).join(" • ") || `Competitie ${id}`;
      return {
        id,
        label: fallbackLabel,
        matches: groupedMap.get(id)?.matches || []
      };
    })
    : grouped;

  for (const league of grouped) {
    if (!catalog.some((entry) => entry.id === league.id)) {
      catalog.push(league);
    }
  }

  return catalog.sort((a, b) => a.label.localeCompare(b.label));
}

function toDayStamp(day) {
  const time = new Date(`${day}T12:00:00`).getTime();
  return Number.isFinite(time) ? time : 0;
}

function toLocalDayString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isUpcomingMatch(match) {
  const start = new Date(String(match?.startTime || "")).getTime();
  return Number.isFinite(start) && start >= Date.now();
}

function getLatestAvailableDay(matches) {
  return [...new Set((matches || []).map((match) => String(match?.day || "")).filter(Boolean))]
    .sort((a, b) => toDayStamp(a) - toDayStamp(b))
    .slice(-1)[0] || "";
}

function getDataStatus() {
  const today = toLocalDayString();
  const latestDay = state.latestAvailableDay || "";
  const hasUpcoming = Array.isArray(state.matches) && state.matches.length > 0;
  const latestDayStale = latestDay ? toDayStamp(latestDay) < toDayStamp(today) : false;
  const generatedAt = state.matchesGeneratedAt ? new Date(state.matchesGeneratedAt) : null;
  const generatedLabel = generatedAt && Number.isFinite(generatedAt.getTime())
    ? generatedAt.toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" })
    : "";

  if (!hasUpcoming && latestDay) {
    return {
      stale: true,
      message: `Feed-ul actual se opreste la ${fmtDayLong(latestDay)}${generatedLabel ? `, generat la ${generatedLabel}` : ""}. E nevoie de un refresh OddsPapi ca sa apara meciurile noi.`
    };
  }

  if (latestDayStale) {
    return {
      stale: true,
      message: `Datele disponibile sunt in urma fata de azi. Ultima zi din snapshot este ${fmtDayLong(latestDay)}${generatedLabel ? `, generat la ${generatedLabel}` : ""}.`
    };
  }

  return { stale: false, message: "" };
}

function renderDataStatus() {
  const notice = el("dataStatusNotice");
  if (!notice) return;
  const status = getDataStatus();
  if (!status.message) {
    notice.hidden = true;
    notice.innerHTML = "";
    return;
  }
  notice.hidden = false;
  notice.innerHTML = `<div class="reason-item">${escapeHtml(status.message)}</div>`;
}

function refreshActionButtons() {
  const matchBtn = el("analyzeMatchBtn");
  const leagueBtn = el("analyzeLeagueBtn");
  if (matchBtn) matchBtn.disabled = !state.selectedFixtureId;
  if (leagueBtn) leagueBtn.disabled = !state.selectedLeague;
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
    ? (getLeagueCatalog().find((league) => league.id === state.selectedLeague)?.matches || [])
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
      state.activeTab = "analyzer";
      state.leagueMode = false;
      state.analysisVisible = true;
      state.searchTerm = "";
      el("searchInput").value = "";
      el("searchOverlay").hidden = true;
      populateControls();
      renderTabState();
      renderSearchResults();
      formatLeagueMatches();
      renderAnalysis();
    });
  });
}

function renderBacktest() {
  const summaryEl = el("backtestSummary");
  const marketsEl = el("backtestMarkets");
  const data = state.backtest;
  if (!data) {
    summaryEl.innerHTML = `<div class="reason-item">Backtesting indisponibil momentan.</div>`;
    marketsEl.innerHTML = "";
    return;
  }

  summaryEl.innerHTML = `
    <article class="backtest-card">
      <div class="backtest-label">Rata recenta</div>
      <div class="backtest-value">${data.hitRate == null ? "—" : `${data.hitRate}%`}</div>
      <div class="backtest-copy">${escapeHtml(`${data.wins} recomandari au iesit din ${data.sampleSize} meciuri evaluate recent.`)}</div>
    </article>
    <article class="backtest-card">
      <div class="backtest-label">Meciuri sarite</div>
      <div class="backtest-value">${escapeHtml(String(data.noBet || 0))}</div>
      <div class="backtest-copy">Partidele in care modelul a preferat sa nu forteze o recomandare slaba.</div>
    </article>
  `;

  const entries = Object.entries(data.byMarket || {}).slice(0, 6);
  marketsEl.innerHTML = entries.map(([label, item]) => `
    <article class="backtest-market">
      <div>
        <div class="backtest-market-title">${escapeHtml(label)}</div>
        <div class="backtest-market-meta">${escapeHtml(`${item.picks} pick-uri • ${item.wins} corecte • ${item.losses} gresite`)}</div>
      </div>
      <div class="backtest-market-rate">${item.hitRate == null ? "—" : `${item.hitRate}%`}</div>
    </article>
  `).join("");

  const rateChip = el("modelRateChip");
  const popoverCopy = el("modelPopoverCopy");
  if (rateChip) rateChip.textContent = data.hitRate == null ? "—" : `${data.hitRate}%`;
  if (popoverCopy) {
    popoverCopy.textContent = data.hitRate == null
      ? "Nu exista suficient istoric recent pentru o evaluare clara."
      : `${data.hitRate}% rata recenta, cu ${data.wins} recomandari reusite din ${data.sampleSize} meciuri evaluate.`;
  }
}

function getHistEntry(fixtureId) {
  return state.historyByFixtureId[String(fixtureId)] || null;
}

function findMatchByFixtureId(fixtureId) {
  return state.matches.find((match) => String(match.fixtureId) === String(fixtureId)) || null;
}

function getRecommendedPair(match) {
  const pair = buildMatchRecommendationPair(match, getHistEntry) || { primary: null, secondary: null, candidates: [] };
  if (!pair?.primary || pair?.secondary || !Array.isArray(pair?.candidates)) {
    return pair;
  }

  const fallbackSecondary = pair.candidates.find((candidate) => (
    candidate &&
    `${candidate.market}|${candidate.sel}` !== `${pair.primary.market}|${pair.primary.sel}` &&
    Number(candidate.bookOdds) >= Math.max(Number(pair.primary.bookOdds || 0) + 0.04, 1.52) &&
    Number(candidate.bookOdds) <= 1.85 &&
    Number(candidate.p) >= 0.68 &&
    Number(candidate.edge) >= 0.04
  )) || null;

  if (!fallbackSecondary) return pair;
  if (!fallbackSecondary.confidence) {
    fallbackSecondary.confidence = getRecommendationConfidence(fallbackSecondary);
  }

  return {
    ...pair,
    secondary: fallbackSecondary
  };
}

function bestAvailableMarkets(match) {
  const candidates = getCandidatesForMatch(match, getHistEntry)
    .filter((entry) => Number.isFinite(Number(entry?.bookOdds)))
    .sort((a, b) => (Number(b?.p) || 0) - (Number(a?.p) || 0));
  return candidates.slice(0, 18);
}

function getTopRecommendedMatches() {
  const days = [...new Set(state.matches.map((match) => String(match.day || "")).filter(Boolean))].sort();
  const currentDay = days[0] || "";
  const items = state.matches
    .filter((match) => String(match.day || "") === currentDay)
    .map((match) => {
      const pair = getRecommendedPair(match);
      const primary = pair?.primary || pair?.candidates?.[0] || bestAvailableMarkets(match)[0] || null;
      const displayScore = Number.isFinite(Number(primary?.confidence?.score))
        ? Number(primary.confidence.score)
        : Number.isFinite(Number(primary?.p))
          ? Number(primary.p)
          : null;
      if (!primary || displayScore == null || !Number.isFinite(Number(primary?.bookOdds))) return null;
      return {
        match,
        pair: {
          primary,
          secondary: pair?.secondary || null
        },
        score: displayScore,
        day: String(match.day || ""),
        startTime: String(match.startTime || "")
      };
    })
    .filter(Boolean)
    .filter(({ pair }) => Number(pair.primary.bookOdds) >= 1.2 && Number(pair.primary.bookOdds) <= 1.5 && Number(pair.primary.p || 0) >= 0.7)
    .sort((a, b) => {
      const familyRank = (candidate) => {
        const market = String(candidate?.market || "");
        if (market === "1X2" && candidate?.sel === "HOME") return 5;
        if (market === "Double Chance") return 4;
        if (market === "1X2") return 3;
        if (market === "Goals 1.5" && candidate?.sel === "OVER") return 2;
        if (market.startsWith("Corners ")) return 1;
        if (market.startsWith("Cards ")) return 1;
        return 0;
      };
      const familyDelta = familyRank(b.pair.primary) - familyRank(a.pair.primary);
      if (familyDelta !== 0) return familyDelta;
      if (b.score !== a.score) return b.score - a.score;
      const dayCmp = a.day.localeCompare(b.day);
      if (dayCmp !== 0) return dayCmp;
      return a.startTime.localeCompare(b.startTime);
    });

  if (items.length <= 8) return items;
  return items.slice(0, 10);
}

function topMatchesIntro(items) {
  if (!items.length) {
    return "Inca nu sunt destule meciuri clare pentru o selectie rapida.";
  }
  if (items.length < 8) {
    return "Lista ramane mai scurta azi, pentru ca modelul a gasit mai putine meciuri curate.";
  }
  return "Aici vezi meciurile de la care merita sa pornesti mai intai.";
}

function renderTopMatches() {
  const panel = el("topMatchesPanel");
  const grid = el("topMatchesGrid");
  const count = el("topMatchesCount");
  const visible = state.activeTab === "top";
  panel.hidden = !visible;
  if (!visible) {
    grid.innerHTML = "";
    count.textContent = "0 selectii";
    return;
  }

  const items = getTopRecommendedMatches();
  count.textContent = `${items.length} selectii`;
  if (!items.length) {
    const status = getDataStatus();
    grid.innerHTML = `<div class="reason-item">${escapeHtml(status.stale && status.message ? status.message : "Momentan nu exista selectii suficient de clare pentru lista rapida de azi.")}</div>`;
    animatePanel(panel);
    animatePanelSwap(panel);
    return;
  }

  grid.innerHTML = items.map(({ match, pair }) => `
    <button class="top-match-card" type="button" data-top-fixture-id="${String(match.fixtureId)}" data-top-league-id="${String(match.tournamentId)}">
      <div class="top-match-head">
        <div>
          <div class="top-match-title">${escapeHtml(displayTeamName(match.home))} vs ${escapeHtml(displayTeamName(match.away))}</div>
          <div class="top-match-meta">${escapeHtml(fmtDayLong(match.day))} • ${escapeHtml(fmtTime(match.startTime))} • ${escapeHtml(match.categoryName)} • ${escapeHtml(match.tournamentName)}</div>
        </div>
        <div class="pill">${match.hasOdds ? "live" : "fara live"}</div>
      </div>
        <div class="top-match-pick">
          <div class="top-match-kicker">Pronostic recomandat</div>
          <div class="top-match-pick-label">${escapeHtml(pair.primary.displayLabel || "Fara recomandare")}</div>
          <div class="top-match-odds">Cota ${escapeHtml(fmtOdds(pair.primary.bookOdds))}</div>
          <div class="top-match-footer">
            <div class="top-match-copy">${escapeHtml(pair.primary.reason || "Selectie rapida pentru analiza detaliata.")}</div>
            <div class="confidence-pill">${Number.isFinite(Number(pair.primary?.confidence?.score)) ? pct01(pair.primary.confidence.score) : Number.isFinite(Number(pair.primary?.p)) ? pct01(pair.primary.p) : "—"}</div>
          </div>
        </div>
      </button>
    `).join("");

  grid.querySelectorAll("[data-top-fixture-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedLeague = button.getAttribute("data-top-league-id") || "";
      state.selectedFixtureId = button.getAttribute("data-top-fixture-id") || "";
      state.activeTab = "analyzer";
      state.leagueMode = false;
      state.analysisVisible = true;
      populateControls();
      renderTabState();
      renderSearchResults();
      formatLeagueMatches();
      renderAnalysis();
    });
  });

  animatePanel(panel);
  animatePanelSwap(panel);
}

function renderTabState() {
  const isAnalyzer = state.activeTab === "analyzer";
  const isTop = state.activeTab === "top";
  el("tabAnalyzerBtn").classList.toggle("is-active", isAnalyzer);
  el("tabTopBtn").classList.toggle("is-active", isTop);
  el("controlPanel").hidden = !isAnalyzer;
  el("analysisPanel").hidden = !isAnalyzer || !state.analysisVisible;
  el("topMatchesPanel").hidden = !isTop;
  if (!isAnalyzer) {
    el("leaguePanel").hidden = true;
  }
}

function formatLeagueMatches() {
  const panel = el("leaguePanel");
  if (state.activeTab !== "analyzer" || !state.leagueMode || !state.selectedLeague) {
    panel.hidden = true;
    el("leagueMatches").innerHTML = "";
    return;
  }

  panel.hidden = false;
  const selected = getLeagueCatalog().find((league) => league.id === state.selectedLeague);
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
  subtitle.textContent = roundMatches.length
    ? "Meciurile disponibile din etapa curenta."
    : "Momentan nu exista meciuri viitoare pentru competitia selectata.";
  count.textContent = `${roundMatches.length} meciuri`;

  if (!roundMatches.length) {
    const status = getDataStatus();
    list.innerHTML = `<div class="reason-item">${escapeHtml(status.stale && status.message ? status.message : "Nu exista inca meciuri viitoare in etapa curenta pentru aceasta competitie.")}</div>`;
    return;
  }

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
      state.activeTab = "analyzer";
      state.leagueMode = false;
      state.analysisVisible = true;
      syncSelectors();
      renderTabState();
      formatLeagueMatches();
      renderAnalysis();
    });
  });

  animatePanel(panel);
  animatePanelSwap(panel);
}

function renderAnalysisEmpty() {
  el("matchHero").innerHTML = "";
  el("bestBetBody").innerHTML = "";
  el("planBBody").innerHTML = "";
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
    container.innerHTML = `
      <div class="pick-label">Fara recomandare</div>
      <div class="pick-copy">Momentan nu exista un pronostic suficient de clar pentru a fi recomandat cu incredere.</div>
    `;
    return;
  }
  const probability = Number(pick.confidence?.score);
  const probabilityPct = Number.isFinite(probability) ? Math.round(probability * 100) : null;
  const barWidth = probabilityPct == null ? 50 : Math.max(10, Math.min(100, probabilityPct));
  const premiumNote = pick.isPremiumFit
    ? "Se incadreaza in banda premium: cota 1.20-1.50 si minim 70% sanse estimate."
    : pick.isSoftFit
      ? "Este cea mai apropiata varianta curata disponibila in banda de cote pentru acest meci."
      : null;
  container.innerHTML = `
    <div class="pick-label">${pick.displayLabel || fallbackTitle}</div>
    <div class="pick-row">
      <div class="pick-chip">${pick.confidence?.score != null ? pct01(pick.confidence.score) : "—"}</div>
      <div class="muted">${Number.isFinite(Number(pick.bookOdds)) ? `Cota ${fmtOdds(pick.bookOdds)}` : "Cota indisponibila"}</div>
    </div>
    <div class="pick-meter" aria-hidden="true">
      <span class="pick-meter-good" style="width:${barWidth}%"></span>
      <span class="pick-meter-bad" style="width:${100 - barWidth}%"></span>
    </div>
    <div class="pick-copy">${pick.reason || "Pronostic selectat pe baza formei, contextului si pietei disponibile."}</div>
    ${premiumNote ? `<div class="pick-note">${premiumNote}</div>` : ""}
  `;
}

function renderMarkets(match, pair) {
  const candidates = bestAvailableMarkets(match);
  const grid = el("marketsGrid");
  const selectedLabels = new Set([pair?.primary?.displayLabel, pair?.secondary?.displayLabel].filter(Boolean));
  if (!candidates.length) {
    grid.innerHTML = `<div class="reason-item">Momentan nu exista suficiente piete curate pentru acest meci.</div>`;
    return;
  }
  grid.innerHTML = candidates.map((item) => {
    const probability = Number.isFinite(Number(item?.confidence?.score)) ? Number(item.confidence.score) : Number(item?.p);
    const width = Number.isFinite(probability) ? Math.max(8, Math.min(100, probability * 100)) : 8;
    return `
      <article class="market-card">
        <div class="market-title">${selectedLabels.has(item.displayLabel) ? "Piata recomandata" : "Alta varianta"}</div>
        <div class="market-value">${item.displayLabel}</div>
        <div class="market-meta">${Number.isFinite(Number(item.bookOdds)) ? `Cota ${fmtOdds(item.bookOdds)}` : "Cota indisponibila"}${Number.isFinite(probability) ? ` • ${pct01(probability)}` : ""}</div>
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
    reasons.push("Forma celor doua echipe este disponibila si ramane ascunsa pana cand alegi sa o deschizi.");
  }
  reasons.push("Poti deschide toate pietele disponibile daca vrei sa vezi tabloul complet al meciului.");
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
  const analysisPanel = el("analysisPanel");
  if (state.activeTab !== "analyzer") {
    analysisPanel.hidden = true;
    return;
  }
  if (!state.analysisVisible || !state.selectedFixtureId) {
    analysisPanel.hidden = true;
    renderAnalysisEmpty();
    return;
  }
  analysisPanel.hidden = false;
  const match = findMatchByFixtureId(state.selectedFixtureId);
  if (!match) {
    analysisPanel.hidden = true;
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
  animatePanel(analysisPanel);
  animatePanelSwap(analysisPanel);
}

function syncSelectors() {
  el("leagueSelect").value = state.selectedLeague;
  el("matchSelect").value = state.selectedFixtureId;
}

function populateControls() {
  const leagues = getLeagueCatalog();
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
    refreshActionButtons();
    syncSelectors();
    return;
  }

  const roundMatches = getCurrentRoundMatches(selected.matches);
  const selectedMatch = selected.matches.find((match) => String(match.fixtureId) === String(state.selectedFixtureId)) || null;
  const optionMatches = selectedMatch && !roundMatches.some((match) => String(match.fixtureId) === String(selectedMatch.fixtureId))
    ? [selectedMatch, ...roundMatches]
    : roundMatches;

  if (!optionMatches.length) {
    el("matchSelect").innerHTML = `<option value="">Momentan nu exista meciuri disponibile</option>`;
    el("matchSelect").value = "";
    el("matchSelectHint").textContent = getDataStatus().stale && state.latestAvailableDay
      ? `Feed-ul disponibil se opreste la ${fmtDayLong(state.latestAvailableDay)}. Este nevoie de un refresh de date pentru meciurile noi.`
      : "Competitia este disponibila in catalog, dar momentan nu are meciuri viitoare in etapa curenta.";
    state.selectedFixtureId = "";
    refreshActionButtons();
    syncSelectors();
    return;
  }

  el("matchSelect").innerHTML = [
    `<option value="">Alege meciul</option>`,
    ...optionMatches.map((match) => `<option value="${String(match.fixtureId)}">${displayTeamName(match.home)} vs ${displayTeamName(match.away)}</option>`)
  ].join("");
  el("matchSelectHint").textContent = `${roundMatches.length} meciuri disponibile in etapa curenta pentru competitia selectata.`;

  if (!optionMatches.some((match) => String(match.fixtureId) === String(state.selectedFixtureId))) {
    state.selectedFixtureId = "";
  }

  refreshActionButtons();
  syncSelectors();
}

function bindActions() {
  bindPress("tabAnalyzerBtn", () => {
    state.activeTab = "analyzer";
    renderTabState();
    formatLeagueMatches();
    renderAnalysis();
    renderTopMatches();
  });

  bindPress("tabTopBtn", () => {
    state.activeTab = "top";
    renderTabState();
    renderTopMatches();
  });

  bindPress("modelInfoBtn", () => {
    el("modelSummaryModal").hidden = false;
  });

  bindPress("modelDetailsBtn", () => {
    el("modelSummaryModal").hidden = true;
    el("modelDetailsModal").hidden = false;
  });

  bindPress("closeModelSummaryBtn", () => {
    el("modelSummaryModal").hidden = true;
  });

  bindPress("closeModelDetailsBtn", () => {
    el("modelDetailsModal").hidden = true;
  });

  el("modelSummaryBackdrop").addEventListener("click", () => {
    el("modelSummaryModal").hidden = true;
  });

  el("modelDetailsBackdrop").addEventListener("click", () => {
    el("modelDetailsModal").hidden = true;
  });

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

  bindPress("searchToggleBtn", () => {
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

  bindPress("analyzeMatchBtn", () => {
    if (!state.selectedFixtureId) return;
    state.activeTab = "analyzer";
    state.leagueMode = false;
    state.analysisVisible = true;
    renderTabState();
    formatLeagueMatches();
    renderAnalysis();
    const panel = el("analysisPanel");
    if (panel && !panel.hidden) {
      animatePanel(panel);
      animatePanelSwap(panel);
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  bindPress("analyzeLeagueBtn", () => {
    if (!state.selectedLeague) return;
    state.leagueMode = true;
    state.analysisVisible = false;
    formatLeagueMatches();
    renderAnalysis();
    const panel = el("leaguePanel");
    if (panel && !panel.hidden) {
      animatePanel(panel);
      animatePanelSwap(panel);
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  bindPress("toggleMarketsBtn", () => {
    const panel = el("marketsPanel");
    panel.hidden = !panel.hidden;
    el("toggleMarketsBtn").textContent = panel.hidden ? "Afiseaza toate pietele" : "Ascunde toate pietele";
    if (!panel.hidden) {
      animatePanel(panel);
      animatePanelSwap(panel);
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  bindPress("toggleFormBtn", () => {
    const panel = el("formPanel");
    panel.hidden = !panel.hidden;
    el("toggleFormBtn").textContent = panel.hidden ? "Afiseaza forma si comparatia" : "Ascunde forma si comparatia";
  });

  bindPress("toggleReasonsBtn", () => {
    const panel = el("reasonList");
    panel.hidden = !panel.hidden;
    el("toggleReasonsBtn").textContent = panel.hidden ? "Afiseaza justificarea" : "Ascunde justificarea";
  });

  bindPress("applyUpdateBtn", () => {
    if (pendingWorker) {
      hideUpdateBanner();
      window.localStorage.setItem(UPDATE_BANNER_DISMISSED_KEY, "true");
      pendingWorker.postMessage({ type: "SKIP_WAITING" });
      return;
    }
    window.localStorage.setItem(UPDATE_BANNER_DISMISSED_KEY, "true");
    hideUpdateBanner();
    window.location.reload();
  });
}

async function init() {
  const leaguesPayload = await getJson("./data/ui/leagues.json").catch(() => ({ leagues: [] }));
  const matchesPayload = await getJson("./data/ui/matches.json");
  const historyPayload = await getJson("./data/ui/history_stats.json");
  const backtestPayload = await getJson("./data/ui/backtest_summary.json");
  const rawMatches = matchesPayload.matches || [];
  state.catalogLeagues = leaguesPayload.leagues || [];
  state.matchesGeneratedAt = String(matchesPayload.generatedAtUTC || "");
  state.latestAvailableDay = getLatestAvailableDay(rawMatches);
  state.matches = rawMatches
    .filter((match) => isUpcomingMatch(match))
    .map((match) => ({
      ...match,
      home: displayTeamName(match.home),
      away: displayTeamName(match.away)
    }));
  state.historyByFixtureId = historyPayload.byFixtureId || {};
  state.backtest = backtestPayload || null;
  state.selectedLeague = "";
  state.selectedFixtureId = "";
  state.activeTab = "analyzer";
  state.analysisVisible = false;
  state.searchTerm = "";

  populateControls();
  bindActions();
  renderDataStatus();
  refreshActionButtons();
  renderTabState();
  renderSearchResults();
  renderBacktest();
  formatLeagueMatches();
  renderAnalysis();
  renderTopMatches();
  hideUpdateBanner();
  registerServiceWorker().catch(() => {});
}

init();
