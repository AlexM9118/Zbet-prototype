import { getJson, fmtDayLong, fmtTime, fmtOdds, pct01, escapeHtml } from "./js/utils.mjs";
import { buildMatchAnalysis } from "./js/zbet-engine.mjs";

const APP_VERSION = "24";
const UPDATE_BANNER_DISMISSED_KEY = "zbet-mobile-update-dismissed";
const ADMIN_MODE_STORAGE_KEY = "zbet-mobile-admin-mode";
const ADMIN_MODE_CODE = "18111991";

const state = {
  matches: [],
  catalogLeagues: [],
  historyByFixtureId: {},
  backtest: null,
  adminWatchdogStatus: null,
  matchesGeneratedAt: "",
  latestAvailableDay: "",
  activeScreen: "dashboard",
  matchFilter: "latest",
  selectedLeague: "",
  selectedFixtureId: "",
  detailTab: "overview",
  searchTerm: "",
  adminMode: false
};

let pendingWorker = null;

const el = (id) => document.getElementById(id);

function toDayStamp(day) {
  const time = new Date(`${day}T12:00:00`).getTime();
  return Number.isFinite(time) ? time : 0;
}

function displayTeamName(name) {
  return String(name || "").trim();
}

function initialsFor(name) {
  const words = String(name || "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() || "").join("") || "FB";
}

function getLatestAvailableDay(matches) {
  return [...new Set((matches || []).map((match) => String(match?.day || "")).filter(Boolean))]
    .sort((left, right) => toDayStamp(left) - toDayStamp(right))
    .slice(-1)[0] || "";
}

function groupMatchesByLeague(matches) {
  const map = new Map();
  for (const match of matches) {
    const key = String(match.tournamentId || "");
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        tournamentId: String(match.tournamentId || ""),
        label: `${match.categoryName} • ${match.tournamentName}`,
        categoryName: match.categoryName,
        tournamentName: match.tournamentName,
        matches: []
      });
    }
    map.get(key).matches.push(match);
  }
  return [...map.values()].sort((left, right) => right.matches.length - left.matches.length || left.label.localeCompare(right.label));
}

function getLeagueCatalog() {
  const grouped = groupMatchesByLeague(state.matches);
  if (!state.catalogLeagues.length) return grouped;
  const groupedMap = new Map(grouped.map((league) => [league.id, league]));
  const catalog = state.catalogLeagues.map((league) => {
    const id = String(league.id ?? league.tournamentId ?? "");
    const fallbackLabel = [league.categoryName, league.name].filter(Boolean).join(" • ") || `Competitie ${id}`;
    return {
      id,
      tournamentId: id,
      label: fallbackLabel,
      categoryName: league.categoryName || "",
      tournamentName: league.name || "",
      matches: groupedMap.get(id)?.matches || []
    };
  });
  for (const league of grouped) {
    if (!catalog.some((item) => item.id === league.id)) catalog.push(league);
  }
  return catalog.sort((left, right) => right.matches.length - left.matches.length || left.label.localeCompare(right.label));
}

function getHistEntry(fixtureId) {
  return state.historyByFixtureId[String(fixtureId)] || null;
}

function findMatchByFixtureId(fixtureId) {
  return state.matches.find((match) => String(match.fixtureId) === String(fixtureId)) || null;
}

function getLeagueMatches(leagueId) {
  return getLeagueCatalog().find((league) => league.id === String(leagueId))?.matches || [];
}

function getAnalysis(match) {
  if (!match) return null;
  const historyEntry = getHistEntry(match.fixtureId);
  if (!historyEntry) return null;
  return buildMatchAnalysis(match, historyEntry, null);
}

function scoreAnalysis(analysis) {
  const primary = analysis?.primary;
  if (!primary) return -999;
  let score = Number(primary.probability || 0) * 4;
  if (Number(primary.displayOdds) >= 1.2 && Number(primary.displayOdds) <= 1.55) score += 0.45;
  if (analysis?.secondary) score += 0.18;
  if (primary.family === "oneXtwo") score += 0.24;
  if (primary.family === "doubleChance") score += 0.16;
  if (primary.family === "corners" || primary.family === "cards") score += 0.12;
  return score;
}

function getFeaturedMatch() {
  const latestDay = state.latestAvailableDay || "";
  const candidates = state.matches.filter((match) => String(match.day || "") === latestDay);
  let best = null;
  for (const match of candidates) {
    const analysis = getAnalysis(match);
    const score = scoreAnalysis(analysis);
    if (!best || score > best.score) best = { match, score };
  }
  return best?.match || candidates[0] || state.matches[0] || null;
}

function selectFeaturedMatchIfNeeded() {
  if (state.selectedFixtureId) return;
  const featured = getFeaturedMatch();
  if (!featured) return;
  state.selectedFixtureId = String(featured.fixtureId);
}

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

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.localStorage.removeItem(UPDATE_BANNER_DISMISSED_KEY);
    window.location.reload();
  });
}

function setAdminMode(enabled) {
  state.adminMode = Boolean(enabled);
  if (enabled) window.localStorage.setItem(ADMIN_MODE_STORAGE_KEY, "true");
  else window.localStorage.removeItem(ADMIN_MODE_STORAGE_KEY);
}

function restoreAdminMode() {
  state.adminMode = window.localStorage.getItem(ADMIN_MODE_STORAGE_KEY) === "true";
}

function formatAdminDateTime(value) {
  if (!value) return "Necunoscut";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Necunoscut";
  return date.toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" });
}

function formatRefreshSource(source) {
  const raw = String(source || "").trim().toLowerCase();
  if (raw === "scheduled") return "Programat";
  if (raw === "watchdog") return "Fallback watchdog";
  if (raw === "manual") return "Manual";
  return "Necunoscut";
}

function renderAdminWatchdog() {
  const panel = el("adminWatchdogPanel");
  if (!panel) return;
  const status = state.adminWatchdogStatus || {};
  panel.innerHTML = `
    <div class="admin-watchdog-item">
      <div class="admin-watchdog-label">Meciuri in snapshot</div>
      <div class="admin-watchdog-value">${escapeHtml(String(state.matches.length || 0))}</div>
      <div class="admin-watchdog-meta">Ultima zi disponibila: ${escapeHtml(state.latestAvailableDay || "N/A")}</div>
    </div>
    <div class="admin-watchdog-item">
      <div class="admin-watchdog-label">Ultimul refresh reusit</div>
      <div class="admin-watchdog-value">${escapeHtml(formatAdminDateTime(status.lastSuccessfulRefreshUTC || state.matchesGeneratedAt))}</div>
      <div class="admin-watchdog-meta">Sursa: ${escapeHtml(formatRefreshSource(status.lastSuccessfulRefreshSource))}</div>
    </div>
    <div class="admin-watchdog-item">
      <div class="admin-watchdog-label">Motiv fallback</div>
      <div class="admin-watchdog-meta">${escapeHtml(status.lastFallbackReason || "N/A")}</div>
    </div>
  `;
}

function getSnapshotNotice() {
  if (!state.latestAvailableDay) return "Snapshot indisponibil momentan.";
  const generatedLabel = state.matchesGeneratedAt
    ? new Date(state.matchesGeneratedAt).toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" })
    : "";
  return `Aplicatia foloseste momentan snapshot-ul din ${fmtDayLong(state.latestAvailableDay)}${generatedLabel ? ` • generat la ${generatedLabel}` : ""}.`;
}

function buildSearchPool() {
  return state.matches.filter((match) => {
    if (!state.searchTerm) return false;
    const haystack = `${match.home} ${match.away} ${match.categoryName} ${match.tournamentName}`.toLowerCase();
    return haystack.includes(state.searchTerm.toLowerCase());
  }).slice(0, 8);
}

function renderSearchResults() {
  const panel = el("searchResults");
  if (!panel) return;
  if (!state.searchTerm.trim()) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }

  const results = buildSearchPool();
  panel.hidden = false;
  panel.innerHTML = results.length
    ? results.map((match) => `
      <button class="search-item" type="button" data-search-fixture-id="${escapeHtml(String(match.fixtureId))}">
        <div class="search-item-title">${escapeHtml(displayTeamName(match.home))} vs ${escapeHtml(displayTeamName(match.away))}</div>
        <div class="search-item-meta">${escapeHtml(match.tournamentName)} • ${escapeHtml(fmtDayLong(match.day))}</div>
      </button>
    `).join("")
    : `<div class="search-item"><div class="search-item-title">Niciun meci gasit</div><div class="search-item-meta">Incearca alta echipa sau alta competitie.</div></div>`;

  panel.querySelectorAll("[data-search-fixture-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedFixtureId = button.getAttribute("data-search-fixture-id") || "";
      const match = findMatchByFixtureId(state.selectedFixtureId);
      state.selectedLeague = String(match?.tournamentId || "");
      state.activeScreen = "detail";
      state.searchTerm = "";
      el("searchInput").value = "";
      el("searchDrawer").hidden = true;
      renderAll();
    });
  });
}

function renderDashboard() {
  const featured = getFeaturedMatch();
  const analysis = getAnalysis(featured);
  const leagueCatalog = getLeagueCatalog();

  el("dashboardSubtitle").textContent = state.latestAvailableDay
    ? `Snapshot activ: ${fmtDayLong(state.latestAvailableDay)}`
    : "Panoul principal al zilei";
  el("dashboardMatchCount").textContent = String(state.matches.length || 0);
  el("dashboardAccuracy").textContent = state.backtest?.hitRate != null ? `${state.backtest.hitRate}%` : "—";
  el("leagueCountBadge").textContent = `${leagueCatalog.length}`;

  if (!featured || !analysis) {
    el("featuredMatchTitle").textContent = "Momentan nu exista meci featured";
    el("featuredMatchMeta").textContent = "Snapshot-ul curent nu ofera suficient context pentru dashboard.";
    return;
  }

  el("featuredMatchTitle").textContent = `${displayTeamName(featured.home)} vs ${displayTeamName(featured.away)}`;
  el("featuredMatchMeta").textContent = `${featured.categoryName} • ${featured.tournamentName} • ${fmtTime(featured.startTime)}`;
  el("featuredMatchPulse").textContent = analysis.hero?.pulseDelta != null ? analysis.hero.pulseDelta.toFixed(1) : "—";
  el("featuredHomeBadge").textContent = initialsFor(featured.home);
  el("featuredAwayBadge").textContent = initialsFor(featured.away);
  el("featuredHomeName").textContent = displayTeamName(featured.home);
  el("featuredAwayName").textContent = displayTeamName(featured.away);
  el("featuredPrimaryPick").textContent = analysis.primary?.label || "Fara semnal";
  el("featuredPrimaryMeta").textContent = analysis.primary ? `${pct01(analysis.primary.probability)} • ${fmtOdds(analysis.primary.displayOdds)}` : "—";
  el("featuredSecondaryPick").textContent = analysis.secondary?.label || "In asteptare";
  el("featuredSecondaryMeta").textContent = analysis.secondary ? `${pct01(analysis.secondary.probability)} • ${fmtOdds(analysis.secondary.displayOdds)}` : "—";
  el("featuredExpectedGoals").textContent = analysis.hero?.expectedGoals ? analysis.hero.expectedGoals.toFixed(2) : "—";
  el("featuredExpectedCorners").textContent = analysis.hero?.expectedCorners ? analysis.hero.expectedCorners.toFixed(1) : "—";
  el("featuredExpectedCards").textContent = analysis.hero?.expectedCards ? analysis.hero.expectedCards.toFixed(1) : "—";

  const leagueList = el("leagueList");
  leagueList.innerHTML = leagueCatalog.slice(0, 6).map((league) => `
    <button class="league-row" type="button" data-dashboard-league-id="${escapeHtml(league.id)}">
      <div class="league-row-main">
        <span class="league-dot"></span>
        <div>
          <div class="league-row-title">${escapeHtml(league.tournamentName || league.label)}</div>
          <div class="league-row-meta">${escapeHtml(league.categoryName || "")} • ${league.matches.length} meciuri</div>
        </div>
      </div>
      <span class="count-pill">${league.matches.length}</span>
    </button>
  `).join("");

  leagueList.querySelectorAll("[data-dashboard-league-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedLeague = button.getAttribute("data-dashboard-league-id") || "";
      state.activeScreen = "matches";
      renderAll();
    });
  });
}

function getVisibleMatches() {
  let source = [...state.matches];
  if (state.matchFilter === "latest" && state.latestAvailableDay) {
    source = source.filter((match) => String(match.day || "") === state.latestAvailableDay);
  }
  if (state.matchFilter === "featured") {
    source = source
      .map((match) => ({ match, analysis: getAnalysis(match) }))
      .filter((item) => item.analysis?.primary)
      .sort((left, right) => scoreAnalysis(right.analysis) - scoreAnalysis(left.analysis))
      .slice(0, 12)
      .map((item) => item.match);
  }
  if (state.selectedLeague) {
    source = source.filter((match) => String(match.tournamentId) === String(state.selectedLeague));
  }
  return source.sort((left, right) => String(left.startTime || "").localeCompare(String(right.startTime || "")));
}

function renderMatches() {
  el("snapshotNotice").textContent = getSnapshotNotice();
  el("matchesSubtitle").textContent = state.selectedLeague
    ? `Competitia filtrata: ${getLeagueCatalog().find((league) => league.id === state.selectedLeague)?.tournamentName || "Competitie selectata"}`
    : "Lista zilei si competitiile active";

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.getAttribute("data-filter") === state.matchFilter);
  });

  const leagueCatalog = getLeagueCatalog();
  const chipRow = el("leagueChipRow");
  chipRow.innerHTML = `
    <button class="league-chip${state.selectedLeague ? "" : " is-active"}" type="button" data-chip-league="">Toate ligile</button>
    ${leagueCatalog.slice(0, 12).map((league) => `
      <button class="league-chip${state.selectedLeague === league.id ? " is-active" : ""}" type="button" data-chip-league="${escapeHtml(league.id)}">${escapeHtml(league.tournamentName || league.label)}</button>
    `).join("")}
  `;

  chipRow.querySelectorAll("[data-chip-league]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedLeague = button.getAttribute("data-chip-league") || "";
      renderMatches();
    });
  });

  const matchesList = el("matchesList");
  const items = getVisibleMatches();
  matchesList.innerHTML = items.length
    ? items.map((match) => {
      const analysis = getAnalysis(match);
      return `
        <button class="match-card" type="button" data-match-fixture-id="${escapeHtml(String(match.fixtureId))}">
          <div class="match-card-top">
            <div>
              <div class="match-card-time">${escapeHtml(String(match.startTime || "").slice(11, 16) || "—")}</div>
              <div class="match-card-title">${escapeHtml(displayTeamName(match.home))} vs ${escapeHtml(displayTeamName(match.away))}</div>
              <div class="match-card-league">${escapeHtml(match.tournamentName)} • ${escapeHtml(match.categoryName)}</div>
            </div>
            <span class="count-pill">${analysis?.primary ? pct01(analysis.primary.probability) : "—"}</span>
          </div>
          <div class="match-card-pick">
            <div>
              <div class="match-card-pick-label">${escapeHtml(analysis?.primary?.label || "Fara recomandare")}</div>
              <div class="match-card-pick-meta">${escapeHtml(analysis?.secondary?.label || "Plan B in asteptare")}</div>
            </div>
            <div class="match-card-rate">${analysis?.primary ? fmtOdds(analysis.primary.displayOdds) : "—"}</div>
          </div>
        </button>
      `;
    }).join("")
    : `<div class="match-card"><div class="match-card-title">Nu exista meciuri pentru filtrul curent.</div><div class="match-card-league">Schimba ziua, competitia sau asteapta un refresh al snapshot-ului.</div></div>`;

  matchesList.querySelectorAll("[data-match-fixture-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedFixtureId = button.getAttribute("data-match-fixture-id") || "";
      const match = findMatchByFixtureId(state.selectedFixtureId);
      state.selectedLeague = String(match?.tournamentId || state.selectedLeague);
      state.activeScreen = "detail";
      renderAll();
    });
  });
}

function buildOverviewPanel(match, analysis) {
  const primary = analysis?.primary;
  const secondary = analysis?.secondary;
  const signalWidth = primary ? Math.max(12, Math.round(primary.probability * 100)) : 12;
  return `
    <article class="overview-card">
      <div class="overview-grid">
        <div class="overview-headline">
          <div>
            <div class="dashboard-card-kicker">Probabilitate rezultat</div>
            <div class="overview-title">${escapeHtml(primary?.label || "Fara recomandare")}</div>
            <div class="overview-meta">${primary ? `${pct01(primary.probability)} • ${fmtOdds(primary.displayOdds)}` : "Meciul nu are inca un semnal clar."}</div>
          </div>
          <span class="count-pill">${escapeHtml(primary ? pct01(primary.probability) : "—")}</span>
        </div>
        <div class="signal-bar"><span style="width:${signalWidth}%"></span></div>
        <div class="pick-stack">
          <div class="pick-panel pick-panel-primary">
            <div class="pick-panel-label">Best Bet</div>
            <div class="pick-panel-title">${escapeHtml(primary?.label || "—")}</div>
            <div class="pick-panel-meta">${primary ? `${pct01(primary.probability)} • ${fmtOdds(primary.displayOdds)}` : "Fara recomandare pentru moment."}</div>
          </div>
          <div class="pick-panel pick-panel-secondary">
            <div class="pick-panel-label">Plan B</div>
            <div class="pick-panel-title">${escapeHtml(secondary?.label || "In asteptare")}</div>
            <div class="pick-panel-meta">${secondary ? `${pct01(secondary.probability)} • ${fmtOdds(secondary.displayOdds)}` : "Va aparea cand exista o piata secundara suficient de buna."}</div>
          </div>
        </div>
        <div class="reason-list">
          ${(analysis?.reasons || []).slice(0, 4).map((reason) => `<div class="reason-pill">${escapeHtml(reason)}</div>`).join("")}
        </div>
      </div>
    </article>
  `;
}

function buildStatsPanel(analysis) {
  const metrics = analysis?.metrics || {};
  const rows = [
    { label: "Goluri totale", left: Math.round((metrics.goals?.lh || 0) * 10) / 10, right: Math.round((metrics.goals?.la || 0) * 10) / 10, percent: metrics.goals?.lt ? Math.min(100, Math.round((metrics.goals.lh / metrics.goals.lt) * 100)) : 50 },
    { label: "Cornere estimate", left: Math.round((metrics.corners?.lt || 0) * 0.6), right: Math.round((metrics.corners?.lt || 0) * 0.4), percent: metrics.corners?.lt ? 60 : 50 },
    { label: "Cartonase estimate", left: Math.round((metrics.cards?.lt || 0) * 0.52), right: Math.round((metrics.cards?.lt || 0) * 0.48), percent: metrics.cards?.lt ? 52 : 50 },
    { label: "BTTS", left: analysis?.metrics?.bttsFt ? Math.round(analysis.metrics.bttsFt * 100) : 0, right: analysis?.metrics?.bttsFt ? 100 - Math.round(analysis.metrics.bttsFt * 100) : 0, percent: analysis?.metrics?.bttsFt ? Math.round(analysis.metrics.bttsFt * 100) : 50 }
  ];
  const canonical = analysis?.canonicalRows || [];
  return `
    <article class="stats-card">
      ${rows.map((row) => `
        <div class="stat-label">${escapeHtml(row.label)}</div>
        <div class="stat-bar-row">
          <strong>${escapeHtml(String(row.left))}</strong>
          <div class="stat-bar"><span style="width:${Math.max(8, row.percent)}%"></span></div>
          <strong>${escapeHtml(String(row.right))}</strong>
        </div>
      `).join("")}
    </article>
    <article class="stats-card">
      <div class="dashboard-card-kicker">Piete rapide</div>
      <div class="market-mini-grid">
        ${canonical.slice(0, 6).map((row) => `
          <div class="market-mini-row">
            <span>${escapeHtml(row.label)}</span>
            <strong>${escapeHtml(pct01(row.probability))}</strong>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function buildComparePanel(match, analysis, historyEntry) {
  const homeStats = historyEntry?.homeStats;
  const awayStats = historyEntry?.awayStats;
  const formHome = ["W", "W", "D", "W", "L"];
  const formAway = ["L", "D", "L", "L", "W"];
  const rows = [
    { label: "Goluri marcate", home: homeStats?.homeGF?.toFixed(2) ?? "—", away: awayStats?.awayGF?.toFixed(2) ?? "—" },
    { label: "Goluri primite", home: homeStats?.homeGA?.toFixed(2) ?? "—", away: awayStats?.awayGA?.toFixed(2) ?? "—" },
    { label: "Cornere for", home: homeStats?.homeCornersFor?.toFixed(1) ?? "—", away: awayStats?.awayCornersFor?.toFixed(1) ?? "—" },
    { label: "Cartonase for", home: homeStats?.homeYCFor?.toFixed(1) ?? "—", away: awayStats?.awayYCFor?.toFixed(1) ?? "—" }
  ];

  return `
    <article class="compare-card">
      <div class="compare-header">
        <div class="detail-team-block">
          <div class="detail-team-mark">${escapeHtml(initialsFor(match.home))}</div>
          <span>${escapeHtml(displayTeamName(match.home))}</span>
        </div>
        <div class="screen-subtitle">Forma ultimele 5</div>
        <div class="detail-team-block">
          <div class="detail-team-mark">${escapeHtml(initialsFor(match.away))}</div>
          <span>${escapeHtml(displayTeamName(match.away))}</span>
        </div>
      </div>

      <div class="compare-form-strip">
        ${formHome.map((result) => `<span class="form-chip ${result === "W" ? "win" : result === "D" ? "draw" : "loss"}">${result}</span>`).join("")}
      </div>
      <div class="compare-form-strip" style="margin-top:8px;">
        ${formAway.map((result) => `<span class="form-chip ${result === "W" ? "win" : result === "D" ? "draw" : "loss"}">${result}</span>`).join("")}
      </div>

      <div class="compare-table" style="margin-top:14px;">
        ${rows.map((row) => `
          <div class="compare-row">
            <strong>${escapeHtml(String(row.home))}</strong>
            <div class="compare-row-label">${escapeHtml(row.label)}</div>
            <strong>${escapeHtml(String(row.away))}</strong>
          </div>
        `).join("")}
      </div>
    </article>
    <article class="compare-card">
      <div class="dashboard-card-kicker">Pulse liga</div>
      <div class="market-mini-grid">
        ${(analysis?.leagueTableRows || []).slice(0, 6).map((row, index) => `
          <div class="market-mini-row">
            <span>${index + 1}. ${escapeHtml(row.team)}</span>
            <strong>${escapeHtml(row.score.toFixed(1))}</strong>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function renderDetail() {
  const match = findMatchByFixtureId(state.selectedFixtureId) || getFeaturedMatch();
  if (!match) return;
  const analysis = getAnalysis(match);
  const historyEntry = getHistEntry(match.fixtureId);

  el("detailLeagueLabel").textContent = `${match.categoryName} • ${match.tournamentName}`;
  el("detailKickoffLabel").textContent = fmtTime(match.startTime);
  el("detailHomeBadge").textContent = initialsFor(match.home);
  el("detailAwayBadge").textContent = initialsFor(match.away);
  el("detailHomeName").textContent = displayTeamName(match.home);
  el("detailAwayName").textContent = displayTeamName(match.away);

  document.querySelectorAll("[data-detail-tab]").forEach((button) => {
    const active = button.getAttribute("data-detail-tab") === state.detailTab;
    button.classList.toggle("is-active", active);
  });

  el("detailOverviewTab").hidden = state.detailTab !== "overview";
  el("detailStatsTab").hidden = state.detailTab !== "stats";
  el("detailCompareTab").hidden = state.detailTab !== "compare";

  el("detailOverviewTab").innerHTML = analysis ? buildOverviewPanel(match, analysis) : `<article class="overview-card">Analiza indisponibila.</article>`;
  el("detailStatsTab").innerHTML = analysis ? buildStatsPanel(analysis) : `<article class="stats-card">Statistici indisponibile.</article>`;
  el("detailCompareTab").innerHTML = analysis ? buildComparePanel(match, analysis, historyEntry) : `<article class="compare-card">Comparatia indisponibila.</article>`;
}

function renderBacktestModal() {
  const rateChip = el("modelRateChip");
  const summary = el("backtestSummary");
  const markets = el("backtestMarkets");
  const copy = el("modelPopoverCopy");
  const data = state.backtest;
  if (!data) {
    if (rateChip) rateChip.textContent = "—";
    if (summary) summary.innerHTML = "";
    if (markets) markets.innerHTML = "";
    if (copy) copy.textContent = "Nu exista inca un rezumat recent disponibil.";
    return;
  }

  rateChip.textContent = data.hitRate == null ? "—" : `${data.hitRate}%`;
  copy.textContent = data.hitRate == null
    ? "Nu exista suficient istoric recent pentru o evaluare clara."
    : `${data.hitRate}% rata recenta, cu ${data.wins} recomandari reusite din ${data.sampleSize} meciuri evaluate.`;

  summary.innerHTML = `
    <article class="backtest-card">
      <div class="backtest-label">Rata recenta</div>
      <div class="backtest-value">${data.hitRate == null ? "—" : `${data.hitRate}%`}</div>
      <div class="backtest-copy">${escapeHtml(`${data.wins} recomandari iesite din ${data.sampleSize} meciuri evaluate recent.`)}</div>
    </article>
    <article class="backtest-card">
      <div class="backtest-label">No bet</div>
      <div class="backtest-value">${escapeHtml(String(data.noBet || 0))}</div>
      <div class="backtest-copy">Meciurile in care modelul a preferat sa nu forteze o selectie slaba.</div>
    </article>
  `;

  markets.innerHTML = Object.entries(data.byMarket || {}).slice(0, 5).map(([label, item]) => `
    <article class="backtest-market">
      <div>
        <div class="backtest-market-title">${escapeHtml(label)}</div>
        <div class="backtest-market-meta">${escapeHtml(`${item.picks} pick-uri • ${item.wins} corecte • ${item.losses} gresite`)}</div>
      </div>
      <div class="backtest-market-rate">${item.hitRate == null ? "—" : `${item.hitRate}%`}</div>
    </article>
  `).join("");
}

function renderBottomNav() {
  const map = {
    dashboard: "navDashboardBtn",
    matches: "navMatchesBtn",
    detail: "navDetailBtn"
  };
  Object.entries(map).forEach(([screen, id]) => {
    el(id).classList.toggle("is-active", state.activeScreen === screen);
  });
}

function renderScreens() {
  el("dashboardScreen").hidden = state.activeScreen !== "dashboard";
  el("matchesScreen").hidden = state.activeScreen !== "matches";
  el("detailScreen").hidden = state.activeScreen !== "detail";
  el("backFromDetailBtn").hidden = state.activeScreen !== "detail";
}

function renderAll() {
  selectFeaturedMatchIfNeeded();
  renderScreens();
  renderBottomNav();
  renderSearchResults();
  renderBacktestModal();
  renderAdminWatchdog();
  renderDashboard();
  renderMatches();
  renderDetail();
}

function bindActions() {
  let adminTapCount = 0;
  let adminTapTimer = null;

  el("applyUpdateBtn").addEventListener("click", () => {
    if (pendingWorker) {
      hideUpdateBanner();
      window.localStorage.setItem(UPDATE_BANNER_DISMISSED_KEY, "true");
      pendingWorker.postMessage({ type: "SKIP_WAITING" });
      return;
    }
    hideUpdateBanner();
    window.localStorage.setItem(UPDATE_BANNER_DISMISSED_KEY, "true");
    window.location.reload();
  });

  el("navDashboardBtn").addEventListener("click", () => {
    state.activeScreen = "dashboard";
    renderAll();
  });
  el("navMatchesBtn").addEventListener("click", () => {
    state.activeScreen = "matches";
    renderAll();
  });
  el("navDetailBtn").addEventListener("click", () => {
    state.activeScreen = "detail";
    renderAll();
  });
  el("backFromDetailBtn").addEventListener("click", () => {
    state.activeScreen = "matches";
    renderAll();
  });

  el("openMatchesFromDashboardBtn").addEventListener("click", () => {
    state.activeScreen = "matches";
    renderAll();
  });
  el("openFeaturedDetailBtn").addEventListener("click", () => {
    state.activeScreen = "detail";
    renderAll();
  });
  el("detailOpenInMatchesBtn").addEventListener("click", () => {
    state.activeScreen = "matches";
    renderAll();
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.matchFilter = button.getAttribute("data-filter") || "latest";
      renderMatches();
    });
  });

  el("resetLeagueFilterBtn").addEventListener("click", () => {
    state.selectedLeague = "";
    renderMatches();
  });

  document.querySelectorAll("[data-detail-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.detailTab = button.getAttribute("data-detail-tab") || "overview";
      renderDetail();
    });
  });

  el("searchToggleBtn").addEventListener("click", () => {
    const drawer = el("searchDrawer");
    drawer.hidden = !drawer.hidden;
    if (!drawer.hidden) el("searchInput").focus();
  });
  el("searchInput").addEventListener("input", (event) => {
    state.searchTerm = event.target.value || "";
    renderSearchResults();
  });

  el("modelInfoBtn").addEventListener("click", () => {
    el("modelSummaryModal").hidden = false;
  });
  el("closeModelSummaryBtn").addEventListener("click", () => {
    el("modelSummaryModal").hidden = true;
  });
  el("modelSummaryBackdrop").addEventListener("click", () => {
    el("modelSummaryModal").hidden = true;
  });

  el("adminModeTrigger").addEventListener("click", () => {
    adminTapCount += 1;
    clearTimeout(adminTapTimer);
    adminTapTimer = window.setTimeout(() => { adminTapCount = 0; }, 900);
    if (adminTapCount < 5) return;
    adminTapCount = 0;
    if (!state.adminMode) {
      const code = window.prompt("Cod admin");
      if (code !== ADMIN_MODE_CODE) return;
      setAdminMode(true);
    }
    el("adminWatchdogModal").hidden = false;
  });
  el("closeAdminWatchdogBtn").addEventListener("click", () => {
    el("adminWatchdogModal").hidden = true;
  });
  el("adminWatchdogBackdrop").addEventListener("click", () => {
    el("adminWatchdogModal").hidden = true;
  });
  el("disableAdminModeBtn").addEventListener("click", () => {
    setAdminMode(false);
    el("adminWatchdogModal").hidden = true;
  });
}

async function init() {
  const leaguesPayload = await getJson("./data/ui/leagues.json").catch(() => ({ leagues: [] }));
  const matchesPayload = await getJson("./data/ui/matches.json");
  const historyPayload = await getJson("./data/ui/history_stats.json");
  const backtestPayload = await getJson("./data/ui/backtest_summary.json").catch(() => null);
  const adminWatchdogPayload = await getJson("./data/ui/admin_watchdog_status.json").catch(() => ({}));

  state.catalogLeagues = leaguesPayload.leagues || [];
  state.matches = (matchesPayload.matches || []).map((match) => ({
    ...match,
    home: displayTeamName(match.home),
    away: displayTeamName(match.away)
  }));
  state.historyByFixtureId = historyPayload.byFixtureId || {};
  state.backtest = backtestPayload;
  state.adminWatchdogStatus = adminWatchdogPayload || {};
  state.matchesGeneratedAt = String(matchesPayload.generatedAtUTC || "");
  state.latestAvailableDay = getLatestAvailableDay(state.matches);
  restoreAdminMode();
  selectFeaturedMatchIfNeeded();
  bindActions();
  renderAll();
  hideUpdateBanner();
  registerServiceWorker().catch(() => {});
}

init();
