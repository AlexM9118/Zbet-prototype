import { getJson, fmtOdds, fmtDayLong, fmtTime, pct01, escapeHtml } from "./js/utils.mjs";
import { buildMatchAnalysis } from "./js/zbet-engine.mjs";

const TEAM_DISPLAY_ALIASES = {
  "Fotbal Club FCSB": "FCSB"
};

const state = {
  matches: [],
  catalogLeagues: [],
  historyByFixtureId: {},
  backtest: null,
  adminWatchdogStatus: null,
  matchesGeneratedAt: "",
  latestAvailableDay: "",
  adminMode: false,
  selectedLeague: "",
  selectedFixtureId: "",
  activeTab: "analyzer",
  leagueMode: false,
  analysisVisible: false,
  searchTerm: "",
  leagueStatsCache: new Map()
};

let pendingWorker = null;
const UPDATE_BANNER_DISMISSED_KEY = "zbet-prototype-update-dismissed";
const ADMIN_MODE_STORAGE_KEY = "zbet-prototype-admin-mode";
const ADMIN_MODE_CODE = "18111991";
const APP_VERSION = "23";

const el = (id) => document.getElementById(id);

function displayTeamName(name) {
  const raw = String(name || "").trim();
  return TEAM_DISPLAY_ALIASES[raw] || raw;
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
  const matchDay = String(match?.day || "");
  return Boolean(
    (Number.isFinite(start) && start >= Date.now()) ||
    (matchDay && toDayStamp(matchDay) >= toDayStamp(toLocalDayString()))
  );
}

function getLatestAvailableDay(matches) {
  return [...new Set((matches || []).map((match) => String(match?.day || "")).filter(Boolean))]
    .sort((left, right) => toDayStamp(left) - toDayStamp(right))
    .slice(-1)[0] || "";
}

function getDataStatus() {
  const today = toLocalDayString();
  const latestDay = state.latestAvailableDay || "";
  const hasUpcoming = Array.isArray(state.matches) && state.matches.length > 0;
  const latestDayStale = latestDay ? toDayStamp(latestDay) < toDayStamp(today) : false;
  const generatedAt = state.matchesGeneratedAt ? new Date(state.matchesGeneratedAt) : null;
  const ageHours = generatedAt && Number.isFinite(generatedAt.getTime())
    ? Math.max(0, Math.round((Date.now() - generatedAt.getTime()) / 3600000))
    : null;
  const generatedLabel = generatedAt && Number.isFinite(generatedAt.getTime())
    ? generatedAt.toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" })
    : "";
  const agedSnapshot = ageHours != null && ageHours >= 24;

  if (!hasUpcoming && latestDay) {
    return {
      stale: true,
      message: `Snapshot activ: ${fmtDayLong(latestDay)}${generatedLabel ? ` • generat la ${generatedLabel}` : ""}. Pentru meciuri mai noi este necesar un refresh al feed-ului.`
    };
  }

  if (latestDayStale) {
    return {
      stale: true,
      message: `Aplicatia foloseste momentan snapshot-ul din ${fmtDayLong(latestDay)}${generatedLabel ? ` • generat la ${generatedLabel}` : ""}.`
    };
  }

  if (agedSnapshot) {
    return {
      stale: false,
      warn: true,
      message: `Snapshot-ul curent este mai vechi de 24h${generatedLabel ? ` • ultima generare ${generatedLabel}` : ""}. Pot lipsi unele meciuri sau actualizari.`
    };
  }

  return { stale: false, message: "" };
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

  registration.update().catch(() => {});
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

function setAdminMode(enabled) {
  state.adminMode = Boolean(enabled);
  if (state.adminMode) {
    window.localStorage.setItem(ADMIN_MODE_STORAGE_KEY, "true");
  } else {
    window.localStorage.removeItem(ADMIN_MODE_STORAGE_KEY);
  }
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
  if (!state.adminMode) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }

  const adminStatus = state.adminWatchdogStatus || {};
  const snapshotDay = state.latestAvailableDay || "N/A";
  const fallbackTriggered = Boolean(adminStatus.lastFallbackTriggeredUTC);
  panel.hidden = false;
  panel.innerHTML = `
    <div class="admin-modal-kicker">Admin</div>
    <div class="admin-modal-title">Control refresh</div>
    <div class="admin-watchdog-grid">
      <article class="admin-watchdog-item admin-watchdog-item-hero">
        <div class="admin-watchdog-label">Meciuri in snapshot</div>
        <div class="admin-watchdog-value">${escapeHtml(String(state.matches.length))}</div>
        <div class="admin-watchdog-meta">Ultima zi disponibila: ${escapeHtml(snapshotDay)}</div>
      </article>
      <article class="admin-watchdog-item">
        <div class="admin-watchdog-label">Ultimul refresh reusit</div>
        <div class="admin-watchdog-value">${escapeHtml(formatAdminDateTime(adminStatus.lastSuccessfulRefreshUTC || state.matchesGeneratedAt))}</div>
      </article>
      <article class="admin-watchdog-item">
        <div class="admin-watchdog-label">Sursa ultimului refresh</div>
        <div class="admin-watchdog-value">${escapeHtml(formatRefreshSource(adminStatus.lastSuccessfulRefreshSource))}</div>
      </article>
      <article class="admin-watchdog-item">
        <div class="admin-watchdog-label">Fallback</div>
        <div class="admin-watchdog-value">${fallbackTriggered ? "Activat" : "Nu a fost nevoie"}</div>
      </article>
      <article class="admin-watchdog-item admin-watchdog-item-wide">
        <div class="admin-watchdog-label">Motiv fallback</div>
        <div class="admin-watchdog-value">${escapeHtml(adminStatus.lastFallbackReason || "N/A")}</div>
      </article>
      <article class="admin-watchdog-item">
        <div class="admin-watchdog-label">Admin mode</div>
        <div class="admin-watchdog-value">Activ pe acest dispozitiv</div>
      </article>
    </div>
  `;
}

function openAdminWatchdogModal() {
  renderAdminWatchdog();
  el("adminWatchdogModal").hidden = false;
}

function closeAdminWatchdogModal() {
  el("adminWatchdogModal").hidden = true;
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
  return Array.from(map.values()).sort((left, right) => left.label.localeCompare(right.label));
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

  return catalog.sort((left, right) => left.label.localeCompare(right.label));
}

function getCurrentRoundMatches(matches) {
  if (!Array.isArray(matches) || !matches.length) return [];
  const uniqueDays = [...new Set(matches.map((match) => String(match.day || "")).filter(Boolean))]
    .sort((left, right) => toDayStamp(left) - toDayStamp(right));
  if (!uniqueDays.length) return matches;

  const roundDays = [uniqueDays[uniqueDays.length - 1]];
  for (let index = uniqueDays.length - 2; index >= 0; index -= 1) {
    const previous = toDayStamp(uniqueDays[index + 1]);
    const current = toDayStamp(uniqueDays[index]);
    const gapDays = Math.round((current - previous) / 86400000);
    if (Math.abs(gapDays) > 2) break;
    roundDays.unshift(uniqueDays[index]);
  }

  const roundSet = new Set(roundDays);
  return matches.filter((match) => roundSet.has(String(match.day || "")));
}

function findMatchByFixtureId(fixtureId) {
  return state.matches.find((match) => String(match.fixtureId) === String(fixtureId)) || null;
}

function getHistEntry(fixtureId) {
  return state.historyByFixtureId[String(fixtureId)] || null;
}

function getLeagueMatches(leagueId) {
  return getLeagueCatalog().find((league) => league.id === String(leagueId))?.matches || [];
}

function getLeagueStatsCode(leagueId, fixtureId = "") {
  const fromFixture = fixtureId ? getHistEntry(fixtureId)?.footballDataId : "";
  if (fromFixture) return String(fromFixture);
  const leagueMatches = getLeagueMatches(leagueId);
  const code = leagueMatches
    .map((match) => getHistEntry(match.fixtureId)?.footballDataId)
    .find(Boolean);
  return code ? String(code) : "";
}

async function ensureLeagueStats(leagueId, fixtureId = "") {
  const code = getLeagueStatsCode(leagueId, fixtureId);
  if (!code) return null;
  if (state.leagueStatsCache.has(code)) return state.leagueStatsCache.get(code);
  const payload = await getJson(`./data/stats/${code}.json`).catch(() => null);
  state.leagueStatsCache.set(code, payload);
  return payload;
}

function getSelectedLeagueStats() {
  const code = getLeagueStatsCode(state.selectedLeague, state.selectedFixtureId);
  return code ? state.leagueStatsCache.get(code) || null : null;
}

function getAnalysis(match) {
  if (!match) return null;
  return buildMatchAnalysis(match, getHistEntry(match.fixtureId), getSelectedLeagueStats());
}

function formatOutcomeBadge(verdict) {
  if (verdict === "bet") return "BET";
  if (verdict === "watch") return "WATCH";
  return "AVOID";
}

function renderPickCard(container, pick, fallbackTitle) {
  if (!container) return;
  if (!pick) {
    container.innerHTML = `
      <div class="pick-title">${escapeHtml(fallbackTitle)}</div>
      <div class="pick-copy">Momentan nu exista un semnal suficient de clar pentru un pariu recomandat cu incredere.</div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="pick-topline">
      <div class="pick-label">${escapeHtml(pick.label)}</div>
      <div class="pick-rate">${escapeHtml(pct01(pick.probability))}</div>
    </div>
    <div class="pick-bars">
      <span class="pick-bar-positive" style="width:${Math.max(12, Math.round(pick.probability * 100))}%"></span>
      <span class="pick-bar-negative" style="width:${Math.max(12, 100 - Math.round(pick.probability * 100))}%"></span>
    </div>
    <div class="pick-metrics">
      <div><span>${escapeHtml(pick.oddsLabel)}</span><strong>${escapeHtml(fmtOdds(pick.displayOdds))}</strong></div>
      <div><span>Cota justa</span><strong>${escapeHtml(fmtOdds(pick.fairOdds))}</strong></div>
    </div>
    <div class="pick-copy">${escapeHtml(pick.note || "Selectie filtrata de motorul propriu ZBet pentru banda de siguranta si claritate.")}</div>
  `;
}

function renderHero(match, analysis) {
  const node = el("matchHero");
  if (!node || !match || !analysis?.hero) return;
  const hero = analysis.hero;
  const edge = hero.pulseDelta > 0 ? "Avantaj gazde" : hero.pulseDelta < 0 ? "Avantaj oaspeti" : "Echilibru";
  node.innerHTML = `
    <div class="match-hero-head">
      <div>
        <div class="panel-eyebrow">${escapeHtml(hero.leagueLabel)}</div>
        <h2 class="match-hero-title">${escapeHtml(displayTeamName(match.home))} <span>vs</span> ${escapeHtml(displayTeamName(match.away))}</h2>
        <div class="match-hero-meta">${escapeHtml(fmtTime(match.startTime))} • ${escapeHtml(edge)}</div>
      </div>
      <div class="hero-pulse-chip">${escapeHtml(hero.pulseDelta.toFixed(1))}</div>
    </div>
    <div class="hero-metrics">
      <article class="hero-metric">
        <span>Goluri estimate</span>
        <strong>${hero.expectedGoals ? escapeHtml(hero.expectedGoals.toFixed(2)) : "—"}</strong>
      </article>
      <article class="hero-metric">
        <span>Cornere estimate</span>
        <strong>${hero.expectedCorners ? escapeHtml(hero.expectedCorners.toFixed(1)) : "—"}</strong>
      </article>
      <article class="hero-metric">
        <span>Cartonase estimate</span>
        <strong>${hero.expectedCards ? escapeHtml(hero.expectedCards.toFixed(1)) : "—"}</strong>
      </article>
      <article class="hero-metric">
        <span>Model pulse</span>
        <strong>${escapeHtml(edge)}</strong>
      </article>
    </div>
  `;
}

function renderReasonList(analysis) {
  const node = el("reasonList");
  if (!node) return;
  const reasons = analysis?.reasons || [];
  node.innerHTML = reasons.length
    ? reasons.map((reason) => `<div class="reason-chip">${escapeHtml(reason)}</div>`).join("")
    : `<div class="reason-chip">Momentan lipsesc suficiente date pentru o justificare mai bogata.</div>`;
}

function renderLeagueTable(analysis) {
  const node = el("leagueTableBody");
  if (!node) return;
  const rows = analysis?.leagueTableRows || [];
  node.innerHTML = rows.length
    ? rows.map((row, index) => `
      <div class="league-table-row${row.isSelected ? " is-selected" : ""}">
        <div class="league-table-rank">${index + 1}</div>
        <div class="league-table-team">${escapeHtml(row.team)}</div>
        <div class="league-table-metric">${escapeHtml(row.gf.toFixed(2))}</div>
        <div class="league-table-metric">${escapeHtml(row.ga.toFixed(2))}</div>
        <div class="league-table-score">${escapeHtml(row.score.toFixed(1))}</div>
      </div>
    `).join("")
    : `<div class="empty-copy">Tabela ligii apare dupa ce competitia are o sursa statistica asociata.</div>`;
}

function renderMatrix(analysis) {
  const node = el("matrixGrid");
  if (!node) return;
  const rows = analysis?.canonicalRows || [];
  node.innerHTML = rows.length
    ? rows.map((row) => `
      <article class="matrix-row matrix-row-${row.verdict}">
        <div class="matrix-row-label">${escapeHtml(row.label)}</div>
        <div class="matrix-row-meta">
          <span>${escapeHtml(pct01(row.probability))}</span>
          <span>${escapeHtml(fmtOdds(row.displayOdds))}</span>
        </div>
        <div class="matrix-row-badge">${formatOutcomeBadge(row.verdict)}</div>
      </article>
    `).join("")
    : `<div class="empty-copy">Matricea de recomandari se populeaza dupa ce exista suficient context pentru meciul selectat.</div>`;
}

function renderMarketGroups(analysis) {
  const node = el("marketGroupsGrid");
  if (!node) return;
  const groups = analysis?.marketGroups || [];
  node.innerHTML = groups.length
    ? groups.map((group) => `
      <section class="market-card">
        <div class="market-card-head">
          <h3>${escapeHtml(group.title)}</h3>
          <span>${escapeHtml(group.rows.length)} linii</span>
        </div>
        <div class="market-rows">
          ${group.rows.map((row) => `
            <article class="market-row">
              <div class="market-row-main">
                <div class="market-row-label">${escapeHtml(row.label)}</div>
                <div class="market-row-sub">${escapeHtml(row.oddsLabel)} ${escapeHtml(fmtOdds(row.displayOdds))}</div>
              </div>
              <div class="market-row-side">
                <div class="market-row-rate">${escapeHtml(pct01(row.probability))}</div>
                <div class="market-row-meter"><span style="width:${Math.max(8, Math.round(row.probability * 100))}%"></span></div>
              </div>
            </article>
          `).join("")}
        </div>
      </section>
    `).join("")
    : `<div class="empty-copy">Nu exista suficiente date pentru a construi tabloul complet al pietelor.</div>`;
}

function renderForm(analysis, historyEntry) {
  const node = el("formGrid");
  if (!node) return;
  const homeStats = historyEntry?.homeStats;
  const awayStats = historyEntry?.awayStats;
  const metrics = analysis?.metrics || {};

  if (!homeStats || !awayStats) {
    node.innerHTML = `<div class="empty-copy">Forma recenta lipseste pentru acest meci.</div>`;
    return;
  }

  node.innerHTML = `
    <article class="stat-card stat-card-home">
      <div class="stat-card-kicker">Forma gazde · ultimele 5</div>
      <h3>${escapeHtml(displayTeamName(historyEntry.home || ""))}</h3>
      <div class="stat-table">
        <div><span>Goluri marcate</span><strong>${escapeHtml(homeStats.homeGF.toFixed(2))}</strong></div>
        <div><span>Goluri primite</span><strong>${escapeHtml(homeStats.homeGA.toFixed(2))}</strong></div>
        <div><span>Cornere for</span><strong>${escapeHtml(homeStats.homeCornersFor.toFixed(1))}</strong></div>
        <div><span>Cartonase for</span><strong>${escapeHtml(homeStats.homeYCFor.toFixed(1))}</strong></div>
      </div>
    </article>
    <article class="stat-card stat-card-center">
      <div class="stat-card-kicker">Centru de model</div>
      <h3>Comparatie rapida</h3>
      <div class="stat-table">
        <div><span>Goluri FT</span><strong>${metrics.goals ? escapeHtml(metrics.goals.lt.toFixed(2)) : "—"}</strong></div>
        <div><span>Goluri HT</span><strong>${metrics.goalsHt ? escapeHtml(metrics.goalsHt.lt.toFixed(2)) : "—"}</strong></div>
        <div><span>BTTS</span><strong>${metrics.bttsFt ? escapeHtml(pct01(metrics.bttsFt)) : "—"}</strong></div>
        <div><span>Tempo</span><strong>${metrics.tempo ? escapeHtml(pct01(metrics.tempo)) : "—"}</strong></div>
      </div>
    </article>
    <article class="stat-card stat-card-away">
      <div class="stat-card-kicker">Forma oaspeti · ultimele 5</div>
      <h3>${escapeHtml(displayTeamName(historyEntry.away || ""))}</h3>
      <div class="stat-table">
        <div><span>Goluri marcate</span><strong>${escapeHtml(awayStats.awayGF.toFixed(2))}</strong></div>
        <div><span>Goluri primite</span><strong>${escapeHtml(awayStats.awayGA.toFixed(2))}</strong></div>
        <div><span>Cornere for</span><strong>${escapeHtml(awayStats.awayCornersFor.toFixed(1))}</strong></div>
        <div><span>Cartonase for</span><strong>${escapeHtml(awayStats.awayYCFor.toFixed(1))}</strong></div>
      </div>
    </article>
  `;
}

function renderPowerRanking(analysis) {
  const node = el("powerRankingBody");
  if (!node) return;
  const rows = analysis?.powerRanking || [];
  node.innerHTML = rows.length
    ? rows.map((row, index) => `
      <div class="ranking-row${row.isSelected ? " is-selected" : ""}">
        <div class="ranking-rank">${index + 1}</div>
        <div class="ranking-team">${escapeHtml(row.team)}</div>
        <div class="ranking-metric">${escapeHtml(row.gf.toFixed(2))}</div>
        <div class="ranking-metric">${escapeHtml(row.ga.toFixed(2))}</div>
        <div class="ranking-metric">${escapeHtml(row.corners.toFixed(1))}</div>
        <div class="ranking-score">${escapeHtml(row.score.toFixed(1))}</div>
      </div>
    `).join("")
    : `<div class="empty-copy">Power ranking-ul ligii apare dupa ce putem asocia o sursa statistica valida pentru competitia selectata.</div>`;
}

function renderAnalysisEmpty(message = "Alege competitia si meciul, apoi deschidem analiza completa.") {
  el("analysisPanel").hidden = false;
  el("matchHero").innerHTML = `<div class="empty-copy">${escapeHtml(message)}</div>`;
  el("bestBetBody").innerHTML = "";
  el("planBBody").innerHTML = "";
  el("reasonList").innerHTML = "";
  el("matrixGrid").innerHTML = "";
  el("marketGroupsGrid").innerHTML = "";
  el("formGrid").innerHTML = "";
  el("powerRankingBody").innerHTML = "";
  el("leagueTableBody").innerHTML = `<div class="empty-copy">Tabela ligii si tabloul de piete apar dupa selectia meciului.</div>`;
}

function renderAnalysis() {
  const panel = el("analysisPanel");
  if (state.activeTab !== "analyzer") {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  if (!state.analysisVisible) {
    renderAnalysisEmpty("Alege competitia, apoi un meci sau toata etapa. ZBet iti va construi aici tabloul complet: recomandari, matrice de piete si pulse-ul ligii.");
    return;
  }
  const match = findMatchByFixtureId(state.selectedFixtureId);
  if (!match) {
    renderAnalysisEmpty("Selectia curenta nu mai exista in snapshot-ul activ.");
    return;
  }

  const historyEntry = getHistEntry(match.fixtureId);
  if (!historyEntry) {
    renderAnalysisEmpty("Momentan lipsesc suficiente date pentru o analiza de incredere pe acest meci.");
    return;
  }

  const analysis = getAnalysis(match);
  renderHero(match, analysis);
  renderPickCard(el("bestBetBody"), analysis?.primary, "Best Bet");
  renderPickCard(el("planBBody"), analysis?.secondary, "Plan B");
  renderReasonList(analysis);
  renderLeagueTable(analysis);
  renderMatrix(analysis);
  renderMarketGroups(analysis);
  renderForm(analysis, historyEntry);
  renderPowerRanking(analysis);
}

function renderStagePanel() {
  const panel = el("stagePanel");
  const grid = el("stageGrid");
  const count = el("stageCount");
  const title = el("stageTitle");
  const subtitle = el("stageSubtitle");

  if (state.activeTab !== "analyzer" || !state.leagueMode || !state.selectedLeague) {
    panel.hidden = true;
    grid.innerHTML = "";
    return;
  }

  panel.hidden = false;
  const league = getLeagueCatalog().find((entry) => entry.id === state.selectedLeague);
  const matches = league ? getCurrentRoundMatches(league.matches) : [];
  title.textContent = league?.label || "Etapa curenta";
  subtitle.textContent = matches.length
    ? "Aici vezi toate meciurile din fereastra curenta a competitiei, fiecare cu recomandare rapida."
    : "Momentan nu exista meciuri disponibile pentru competitia selectata.";
  count.textContent = `${matches.length} meciuri`;

  if (!matches.length) {
    grid.innerHTML = `<div class="empty-copy">Nu exista meciuri disponibile in etapa curenta pentru aceasta competitie.</div>`;
    return;
  }

  grid.innerHTML = matches.map((match) => {
    const analysis = getAnalysis(match);
    return `
      <button class="stage-card" type="button" data-stage-fixture-id="${escapeHtml(String(match.fixtureId))}">
        <div class="stage-card-head">
          <div>
            <div class="stage-card-title">${escapeHtml(displayTeamName(match.home))} vs ${escapeHtml(displayTeamName(match.away))}</div>
            <div class="stage-card-meta">${escapeHtml(fmtDayLong(match.day))} • ${escapeHtml(fmtTime(match.startTime))}</div>
          </div>
          <div class="stage-pill">${escapeHtml(match.hasOdds ? "live" : "model")}</div>
        </div>
        <div class="stage-card-picks">
          <div class="stage-pick">
            <span>Best Bet</span>
            <strong>${escapeHtml(analysis?.primary?.label || "Fara semnal clar")}</strong>
          </div>
          <div class="stage-pick">
            <span>Plan B</span>
            <strong>${escapeHtml(analysis?.secondary?.label || "In asteptare")}</strong>
          </div>
        </div>
      </button>
    `;
  }).join("");

  grid.querySelectorAll("[data-stage-fixture-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedFixtureId = button.getAttribute("data-stage-fixture-id") || "";
      state.leagueMode = false;
      state.analysisVisible = true;
      syncSelectors();
      renderAll();
      el("analysisPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function getRadarMatches() {
  const day = state.latestAvailableDay || "";
  return state.matches
    .filter((match) => String(match.day || "") === day)
    .map((match) => ({ match, analysis: getAnalysis(match) }))
    .map((item) => {
      const pick = item.analysis?.primary;
      const score = pick ? (pick.probability * 3) + (pick.displayOdds >= 1.2 && pick.displayOdds <= 1.55 ? 0.25 : 0) : -1;
      return { ...item, score };
    })
    .filter((item) => item.analysis?.primary)
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);
}

function scoreFeaturedAnalysis(analysis) {
  const primary = analysis?.primary;
  if (!primary) return -999;
  let score = Number(primary.probability || 0) * 4;
  if (Number(primary.displayOdds) >= 1.2 && Number(primary.displayOdds) <= 1.55) score += 0.45;
  if (analysis?.secondary) score += 0.18;
  if (primary.family === "oneXtwo") score += 0.2;
  if (primary.family === "doubleChance") score += 0.16;
  if (primary.family === "corners" || primary.family === "cards") score += 0.12;
  return score;
}

async function bootstrapFeaturedMatch() {
  const latestDay = state.latestAvailableDay || "";
  const candidates = state.matches.filter((match) => String(match.day || "") === latestDay);
  if (!candidates.length) return;

  let best = null;
  for (const match of candidates) {
    const historyEntry = getHistEntry(match.fixtureId);
    if (!historyEntry) continue;
    const analysis = buildMatchAnalysis(match, historyEntry, null);
    const score = scoreFeaturedAnalysis(analysis);
    if (!best || score > best.score) {
      best = { match, score };
    }
  }

  const featured = best?.match || candidates[0];
  if (!featured) return;
  state.selectedLeague = String(featured.tournamentId || "");
  state.selectedFixtureId = String(featured.fixtureId || "");
  state.leagueMode = false;
  state.analysisVisible = true;
  await ensureLeagueStats(state.selectedLeague, state.selectedFixtureId);
}

function renderRadarPanel() {
  const panel = el("radarPanel");
  const grid = el("radarGrid");
  const count = el("radarCount");
  const label = el("radarLabel");
  if (state.activeTab !== "radar") {
    panel.hidden = true;
    grid.innerHTML = "";
    return;
  }

  panel.hidden = false;
  const items = getRadarMatches();
  count.textContent = `${items.length} meciuri`;
  label.textContent = state.latestAvailableDay
    ? `Snapshot ${fmtDayLong(state.latestAvailableDay)}`
    : "Fara snapshot activ";

  if (!items.length) {
    grid.innerHTML = `<div class="empty-copy">Momentan nu exista meciuri suficient de curate pentru radarul zilei.</div>`;
    return;
  }

  grid.innerHTML = items.map(({ match, analysis }) => `
    <button class="radar-card" type="button" data-radar-fixture-id="${escapeHtml(String(match.fixtureId))}" data-radar-league-id="${escapeHtml(String(match.tournamentId))}">
      <div class="radar-card-head">
        <div>
          <div class="radar-card-title">${escapeHtml(displayTeamName(match.home))} vs ${escapeHtml(displayTeamName(match.away))}</div>
          <div class="radar-card-meta">${escapeHtml(match.categoryName)} • ${escapeHtml(match.tournamentName)}</div>
        </div>
        <div class="radar-rate">${escapeHtml(pct01(analysis.primary.probability))}</div>
      </div>
      <div class="radar-pick-label">${escapeHtml(analysis.primary.label)}</div>
      <div class="radar-card-copy">${escapeHtml(analysis.reasons?.[0] || "Semnalul principal al modelului pentru acest meci.")}</div>
    </button>
  `).join("");

  grid.querySelectorAll("[data-radar-fixture-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedLeague = button.getAttribute("data-radar-league-id") || "";
      state.selectedFixtureId = button.getAttribute("data-radar-fixture-id") || "";
      state.activeTab = "analyzer";
      state.leagueMode = false;
      state.analysisVisible = true;
      populateControls();
      renderAll();
      el("analysisPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
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
  const tone = status.stale ? "status-stale" : status.warn ? "status-warn" : "status-info";
  notice.innerHTML = `<div class="notice-pill ${tone}">${escapeHtml(status.message)}</div>`;
}

function renderSnapshotPreview() {
  const leagueCount = el("snapshotLeagueCount");
  const matchCount = el("snapshotMatchCount");
  const latestDay = el("snapshotLatestDay");
  if (!leagueCount || !matchCount || !latestDay) return;
  leagueCount.textContent = String(getLeagueCatalog().length || 0);
  matchCount.textContent = String(state.matches.length || 0);
  latestDay.textContent = state.latestAvailableDay ? fmtDayLong(state.latestAvailableDay) : "—";
}

function renderBacktest() {
  const summaryEl = el("backtestSummary");
  const marketsEl = el("backtestMarkets");
  const rateChip = el("modelRateChip");
  const popoverCopy = el("modelPopoverCopy");
  const data = state.backtest;

  if (!data) {
    summaryEl.innerHTML = `<div class="empty-copy">Backtesting indisponibil momentan.</div>`;
    marketsEl.innerHTML = "";
    if (rateChip) rateChip.textContent = "—";
    if (popoverCopy) popoverCopy.textContent = "Rezumatul de model recent nu este disponibil.";
    return;
  }

  summaryEl.innerHTML = `
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

  marketsEl.innerHTML = Object.entries(data.byMarket || {})
    .slice(0, 6)
    .map(([market, item]) => `
      <article class="backtest-market">
        <div>
          <div class="backtest-market-title">${escapeHtml(market)}</div>
          <div class="backtest-market-meta">${escapeHtml(`${item.picks} pick-uri • ${item.wins} corecte • ${item.losses} gresite`)}</div>
        </div>
        <div class="backtest-market-rate">${item.hitRate == null ? "—" : `${item.hitRate}%`}</div>
      </article>
    `).join("");

  if (rateChip) rateChip.textContent = data.hitRate == null ? "—" : `${data.hitRate}%`;
  if (popoverCopy) {
    popoverCopy.textContent = data.hitRate == null
      ? "Nu exista suficient istoric recent pentru o evaluare clara."
      : `${data.hitRate}% rata recenta, cu ${data.wins} recomandari reusite din ${data.sampleSize} meciuri evaluate.`;
  }
}

function renderSearchResults() {
  const panel = el("searchResults");
  const term = String(state.searchTerm || "").trim().toLowerCase();
  if (!term) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }

  const baseMatches = state.selectedLeague ? getLeagueMatches(state.selectedLeague) : state.matches;
  const results = baseMatches
    .filter((match) => {
      const haystack = `${displayTeamName(match.home)} ${displayTeamName(match.away)} ${match.categoryName} ${match.tournamentName}`.toLowerCase();
      return haystack.includes(term);
    })
    .sort((left, right) => String(left.startTime || "").localeCompare(String(right.startTime || "")))
    .slice(0, 8);

  if (!results.length) {
    panel.hidden = false;
    panel.innerHTML = `<div class="empty-copy">Nu exista meciuri pentru cautarea ta.</div>`;
    return;
  }

  panel.hidden = false;
  panel.innerHTML = results.map((match) => `
    <button class="search-item" data-search-fixture-id="${escapeHtml(String(match.fixtureId))}" data-search-league-id="${escapeHtml(String(match.tournamentId))}">
      <div class="search-item-title">${escapeHtml(displayTeamName(match.home))} vs ${escapeHtml(displayTeamName(match.away))}</div>
      <div class="search-item-meta">${escapeHtml(fmtDayLong(match.day))} • ${escapeHtml(fmtTime(match.startTime))} • ${escapeHtml(match.tournamentName)}</div>
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
      ensureLeagueStats(state.selectedLeague, state.selectedFixtureId).then(renderAll);
      renderAll();
      el("analysisPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderTabState() {
  const isAnalyzer = state.activeTab === "analyzer";
  el("tabAnalyzerBtn").classList.toggle("is-active", isAnalyzer);
  el("tabRadarBtn").classList.toggle("is-active", !isAnalyzer);
  el("controlPanel").hidden = !isAnalyzer;
}

function populateControls() {
  const leagueSelect = el("leagueSelect");
  const matchSelect = el("matchSelect");
  const matchHint = el("matchSelectHint");
  const leagues = getLeagueCatalog();

  leagueSelect.innerHTML = [
    `<option value="">Alege competitia</option>`,
    ...leagues.map((league) => `<option value="${escapeHtml(league.id)}">${escapeHtml(`${league.label} (${league.matches.length})`)}</option>`)
  ].join("");
  leagueSelect.value = state.selectedLeague || "";

  const selectedMatches = state.selectedLeague ? getCurrentRoundMatches(getLeagueMatches(state.selectedLeague)) : [];
  matchSelect.innerHTML = [
    `<option value="">Alege meciul</option>`,
    ...selectedMatches.map((match) => `<option value="${escapeHtml(String(match.fixtureId))}">${escapeHtml(`${displayTeamName(match.home)} vs ${displayTeamName(match.away)} • ${fmtDayLong(match.day)}`)}</option>`)
  ].join("");
  matchSelect.value = state.selectedFixtureId || "";

  if (!state.selectedLeague) {
    matchHint.textContent = "Selecteaza mai intai competitia, apoi decidem daca analizam un singur meci sau toata etapa.";
  } else if (!selectedMatches.length) {
    matchHint.textContent = "Pentru competitia selectata nu exista momentan meciuri disponibile in fereastra curenta.";
  } else {
    matchHint.textContent = `${selectedMatches.length} meciuri in etapa curenta pentru competitia selectata.`;
  }
}

function refreshActionButtons() {
  el("analyzeMatchBtn").disabled = !state.selectedFixtureId;
  el("analyzeLeagueBtn").disabled = !state.selectedLeague;
  el("clearSelectionBtn").disabled = !state.selectedLeague && !state.selectedFixtureId;
}

function syncSelectors() {
  el("leagueSelect").value = state.selectedLeague || "";
  el("matchSelect").value = state.selectedFixtureId || "";
}

function renderAll() {
  renderDataStatus();
  renderSnapshotPreview();
  renderAdminWatchdog();
  renderBacktest();
  renderTabState();
  renderSearchResults();
  refreshActionButtons();
  renderStagePanel();
  renderAnalysis();
  renderRadarPanel();
}

function bindActions() {
  let adminTapCount = 0;
  let adminTapTimer = null;

  bindPress("applyUpdateBtn", () => {
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

  bindPress("tabAnalyzerBtn", () => {
    state.activeTab = "analyzer";
    renderAll();
  });

  bindPress("tabRadarBtn", () => {
    state.activeTab = "radar";
    renderAll();
  });

  el("leagueSelect").addEventListener("change", async (event) => {
    state.selectedLeague = event.target.value || "";
    state.selectedFixtureId = "";
    state.leagueMode = false;
    state.analysisVisible = false;
    populateControls();
    renderAll();
    if (state.selectedLeague) {
      await ensureLeagueStats(state.selectedLeague);
      renderAll();
    }
  });

  el("matchSelect").addEventListener("change", async (event) => {
    state.selectedFixtureId = event.target.value || "";
    state.leagueMode = false;
    state.analysisVisible = false;
    renderAll();
    if (state.selectedLeague || state.selectedFixtureId) {
      await ensureLeagueStats(state.selectedLeague, state.selectedFixtureId);
      renderAll();
    }
  });

  bindPress("analyzeMatchBtn", async () => {
    if (!state.selectedFixtureId) return;
    state.leagueMode = false;
    state.analysisVisible = true;
    await ensureLeagueStats(state.selectedLeague, state.selectedFixtureId);
    renderAll();
    el("analysisPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  bindPress("analyzeLeagueBtn", async () => {
    if (!state.selectedLeague) return;
    state.leagueMode = true;
    state.analysisVisible = false;
    await ensureLeagueStats(state.selectedLeague, state.selectedFixtureId);
    renderAll();
    el("stagePanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  bindPress("clearSelectionBtn", () => {
    state.selectedLeague = "";
    state.selectedFixtureId = "";
    state.leagueMode = false;
    state.analysisVisible = false;
    populateControls();
    renderAll();
  });

  bindPress("searchToggleBtn", () => {
    const overlay = el("searchOverlay");
    overlay.hidden = !overlay.hidden;
    if (!overlay.hidden) {
      el("searchInput").focus();
    }
  });

  el("searchInput").addEventListener("input", (event) => {
    state.searchTerm = event.target.value || "";
    renderSearchResults();
  });

  bindPress("modelInfoBtn", () => {
    el("modelSummaryModal").hidden = false;
  });
  bindPress("closeModelSummaryBtn", () => { el("modelSummaryModal").hidden = true; });
  bindPress("modelSummaryBackdrop", () => { el("modelSummaryModal").hidden = true; });
  bindPress("modelDetailsBtn", () => { el("modelDetailsModal").hidden = false; });
  bindPress("closeModelDetailsBtn", () => { el("modelDetailsModal").hidden = true; });
  bindPress("modelDetailsBackdrop", () => { el("modelDetailsModal").hidden = true; });

  bindPress("adminModeTrigger", () => {
    adminTapCount += 1;
    clearTimeout(adminTapTimer);
    adminTapTimer = window.setTimeout(() => {
      adminTapCount = 0;
    }, 900);

    if (adminTapCount < 5) return;
    adminTapCount = 0;

    if (state.adminMode) {
      openAdminWatchdogModal();
      return;
    }

    const code = window.prompt("Cod admin");
    if (code === ADMIN_MODE_CODE) {
      setAdminMode(true);
      openAdminWatchdogModal();
    }
  });

  bindPress("closeAdminWatchdogBtn", closeAdminWatchdogModal);
  bindPress("adminWatchdogBackdrop", closeAdminWatchdogModal);
  bindPress("disableAdminModeBtn", () => {
    setAdminMode(false);
    closeAdminWatchdogModal();
  });
}

async function init() {
  const leaguesPayload = await getJson("./data/ui/leagues.json").catch(() => ({ leagues: [] }));
  const matchesPayload = await getJson("./data/ui/matches.json");
  const historyPayload = await getJson("./data/ui/history_stats.json");
  const backtestPayload = await getJson("./data/ui/backtest_summary.json");
  const adminWatchdogPayload = await getJson("./data/ui/admin_watchdog_status.json").catch(() => ({}));
  const rawMatches = matchesPayload.matches || [];

  state.catalogLeagues = leaguesPayload.leagues || [];
  state.matchesGeneratedAt = String(matchesPayload.generatedAtUTC || "");
  state.latestAvailableDay = getLatestAvailableDay(rawMatches);
  state.adminWatchdogStatus = adminWatchdogPayload || null;
  state.matches = rawMatches
    .map((match) => ({
      ...match,
      home: displayTeamName(match.home),
      away: displayTeamName(match.away)
    }))
    .sort((left, right) => String(left.startTime || "").localeCompare(String(right.startTime || "")));
  state.historyByFixtureId = historyPayload.byFixtureId || {};
  state.backtest = backtestPayload || null;
  restoreAdminMode();

  await bootstrapFeaturedMatch();
  populateControls();
  bindActions();
  renderAll();
  hideUpdateBanner();
  registerServiceWorker().catch(() => {});
}

init();
