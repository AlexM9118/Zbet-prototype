import { getJson, fmtDayLong, fmtTime, fmtClock, fmtOdds, pct01, escapeHtml } from "./js/utils.mjs";
import { buildMatchAnalysis } from "./js/zbet-engine.mjs";
import { getTeamLogo } from "./js/team-logos.mjs";

const APP_VERSION = "56";
const UPDATE_BANNER_DISMISSED_KEY = "airo-update-dismissed";
const ADMIN_MODE_STORAGE_KEY = "airo-admin-mode";
const LANGUAGE_STORAGE_KEY = "airo-language";
const ADMIN_MODE_CODE = "18111991";

const COPY = {
  en: {
    greeting: "Here are today’s top AI match insights",
    homeSubtitle: "",
    exploreAll: "See all",
    topInsight: "Top AI match insights",
    viewAnalysis: "View Analysis",
    askKyro: "Ask AIRO",
    topInsights: "Top AI match insights",
    latest: "Latest",
    matches: "Matches",
    matchesSubtitle: "Intelligent match explorer.",
    reset: "Reset",
    filterToday: "Today",
    filterTomorrow: "Tomorrow",
    filterWeekend: "Weekend",
    filterAi: "All",
    aiTitle: "AIRO AI",
    aiSubtitle: "Ask sharper questions. Read the match deeper.",
    online: "Online",
    aiInput: "Ask anything…",
    profile: "Profile",
    profileSubtitle: "Settings, reports and your intelligence layer.",
    account: "Account",
    privacy: "Data & Privacy",
    support: "Support",
    language: "Language",
    settings: "Settings",
    favorites: "Favorites",
    reports: "Reports",
    trackedTeams: "Tracked teams",
    recentHitRate: "Recent hit rate",
    kyroPlus: "AIRO+",
    kyroPlusTitle: "Advanced mode for deeper football intelligence.",
    unlockKyroPlus: "Unlock AIRO+",
    kyroPlusSubtext: "Advanced football analysis powered by AIRO.",
    detailOverview: "Overview",
    detailPredictions: "Predictions",
    detailForm: "Team Form",
    detailH2H: "H2H",
    detailStats: "Stats",
    modelPulse: "Recent model pulse",
    signalRate: "AIRO signal rate",
    noData: "Data unavailable.",
    savedMatches: "Saved matches",
    refreshApp: "Refresh app",
    appRefresh: "App refresh",
    manual: "Manual",
    reloadTitle: "A new version is ready",
    reloadCopy: "Reload the app to switch to the latest AIRO interface.",
    reloadAction: "Reload"
  },
  ro: {
    greeting: "Iata insight-urile AI principale pentru meciurile de azi",
    homeSubtitle: "",
    exploreAll: "Vezi tot",
    topInsight: "Insight-uri AI principale",
    viewAnalysis: "Vezi analiza",
    askKyro: "Intreaba AIRO",
    topInsights: "Top insight-uri AI",
    latest: "Ultimul snapshot",
    matches: "Meciuri",
    matchesSubtitle: "Explorator inteligent de meciuri.",
    reset: "Reset",
    filterToday: "Azi",
    filterTomorrow: "Maine",
    filterWeekend: "Weekend",
    filterAi: "Toate",
    aiTitle: "AIRO AI",
    aiSubtitle: "Pune intrebari mai bune. Citeste meciul mai profund.",
    online: "Online",
    aiInput: "Intreaba orice…",
    profile: "Profil",
    profileSubtitle: "Setari, rapoarte si stratul tau de inteligenta.",
    account: "Cont",
    privacy: "Date si confidentialitate",
    support: "Suport",
    language: "Limba",
    settings: "Setari",
    favorites: "Favorite",
    reports: "Rapoarte",
    trackedTeams: "Echipe urmarite",
    recentHitRate: "Rata recenta",
    kyroPlus: "AIRO+",
    kyroPlusTitle: "Mod avansat pentru inteligenta fotbalistica mai profunda.",
    unlockKyroPlus: "Deblocheaza AIRO+",
    kyroPlusSubtext: "Analiza avansata de fotbal, sustinuta de AIRO.",
    detailOverview: "Prezentare",
    detailPredictions: "Predictii",
    detailForm: "Forma",
    detailH2H: "H2H",
    detailStats: "Statistici",
    modelPulse: "Puls model recent",
    signalRate: "Rata de semnal AIRO",
    noData: "Date indisponibile.",
    savedMatches: "Meciuri salvate",
    refreshApp: "Reincarca app-ul",
    appRefresh: "Refresh app",
    manual: "Manual",
    reloadTitle: "Este gata o versiune noua",
    reloadCopy: "Reincarca aplicatia pentru cea mai noua interfata AIRO.",
    reloadAction: "Reincarca"
  }
};

const state = {
  matches: [],
  catalogLeagues: [],
  historyByFixtureId: {},
  backtest: null,
  adminWatchdogStatus: null,
  matchesGeneratedAt: "",
  latestAvailableDay: "",
  activeScreen: "home",
  matchFilter: "latest",
  selectedLeague: "",
  selectedFixtureId: "",
  detailTab: "overview",
  searchTerm: "",
  adminMode: false,
  language: "en",
  aiMessage: "",
  favoriteFixtureIds: new Set(),
  aiPromptUsed: false
};

let pendingWorker = null;
const el = (id) => document.getElementById(id);

function t(key) {
  return COPY[state.language]?.[key] || COPY.en[key] || key;
}

function toDayStamp(day) {
  const time = new Date(`${day}T12:00:00`).getTime();
  return Number.isFinite(time) ? time : 0;
}

function displayTeamName(name) {
  return String(name || "").trim();
}

function monogramFor(name) {
  const cleaned = String(name || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!cleaned.length) return "KY";
  if (cleaned.length === 1) return cleaned[0].slice(0, 3).toUpperCase();
  return `${cleaned[0][0] || ""}${cleaned[1][0] || ""}`.toUpperCase();
}

function hashName(name) {
  return [...String(name || "")].reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) >>> 0, 7);
}

function badgePalette(name) {
  const hue = hashName(name) % 360;
  const hueAlt = (hue + 28) % 360;
  return {
    primary: `hsl(${hue} 74% 54%)`,
    secondary: `hsl(${hueAlt} 72% 36%)`,
    border: `hsla(${hue} 92% 72% / 0.34)`
  };
}

function badgeMarkup(name, className = "crest-mark") {
  const logoUrl = getTeamLogo(name);
  if (logoUrl) {
    return `
      <div class="${className} has-logo">
        <img class="team-logo-image" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(displayTeamName(name))}" loading="lazy" />
      </div>
    `;
  }
  const mono = monogramFor(name);
  const palette = badgePalette(name);
  const style = `--badge-primary:${palette.primary};--badge-secondary:${palette.secondary};--badge-border:${palette.border};`;
  return `<div class="${className}" style="${style}">${escapeHtml(mono)}</div>`;
}

function setBadgeVisual(id, name) {
  const node = el(id);
  if (!node) return;
  const logoUrl = getTeamLogo(name);
  node.classList.toggle("has-logo", Boolean(logoUrl));
  if (logoUrl) {
    node.textContent = "";
    node.innerHTML = `<img class="team-logo-image" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(displayTeamName(name))}" loading="lazy" />`;
    return;
  }
  node.innerHTML = "";
  const palette = badgePalette(name);
  node.textContent = monogramFor(name);
  node.style.setProperty("--badge-primary", palette.primary);
  node.style.setProperty("--badge-secondary", palette.secondary);
  node.style.setProperty("--badge-border", palette.border);
  node.setAttribute("aria-label", displayTeamName(name));
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function restoreLanguage() {
  const value = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  state.language = value === "ro" ? "ro" : "en";
  document.documentElement.lang = state.language;
}

function setLanguage(language) {
  state.language = language === "ro" ? "ro" : "en";
  document.documentElement.lang = state.language;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, state.language);
}

function setAdminMode(enabled) {
  state.adminMode = Boolean(enabled);
  if (enabled) window.localStorage.setItem(ADMIN_MODE_STORAGE_KEY, "true");
  else window.localStorage.removeItem(ADMIN_MODE_STORAGE_KEY);
}

function restoreAdminMode() {
  state.adminMode = window.localStorage.getItem(ADMIN_MODE_STORAGE_KEY) === "true";
}

function groupMatchesByLeague(matches) {
  const map = new Map();
  for (const match of matches) {
    const key = String(match.tournamentId || "");
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        tournamentName: match.tournamentName,
        categoryName: match.categoryName,
        matches: []
      });
    }
    map.get(key).matches.push(match);
  }
  return [...map.values()].sort((a, b) => b.matches.length - a.matches.length || a.tournamentName.localeCompare(b.tournamentName));
}

function getLeagueCatalog() {
  const grouped = groupMatchesByLeague(state.matches);
  if (!state.catalogLeagues.length) return grouped;
  const groupedMap = new Map(grouped.map((league) => [league.id, league]));
  return state.catalogLeagues.map((league) => {
    const id = String(league.id ?? league.tournamentId ?? "");
    const linked = groupedMap.get(id);
    return {
      id,
      tournamentName: league.name || linked?.tournamentName || `League ${id}`,
      categoryName: league.categoryName || linked?.categoryName || "",
      matches: linked?.matches || []
    };
  }).sort((a, b) => b.matches.length - a.matches.length || a.tournamentName.localeCompare(b.tournamentName));
}

function getLatestAvailableDay(matches) {
  return [...new Set((matches || []).map((match) => String(match.day || "")).filter(Boolean))]
    .sort((left, right) => toDayStamp(left) - toDayStamp(right))
    .slice(-1)[0] || "";
}

function getHistEntry(fixtureId) {
  return state.historyByFixtureId[String(fixtureId)] || null;
}

function findMatchByFixtureId(fixtureId) {
  return state.matches.find((match) => String(match.fixtureId) === String(fixtureId)) || null;
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
  let score = Number(primary.probability || 0) * 3.8;
  if (Number(primary.displayOdds) >= 1.2 && Number(primary.displayOdds) <= 1.55) score += 0.45;
  if (analysis?.secondary) score += 0.18;
  if (primary.family === "doubleChance") score += 0.14;
  if (primary.family === "corners" || primary.family === "cards") score += 0.1;
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

function ensureSelectedFixture() {
  if (state.selectedFixtureId) return;
  const featured = getFeaturedMatch();
  if (featured) state.selectedFixtureId = String(featured.fixtureId);
}

function buildInsightSentence(match, analysis) {
  if (!match || !analysis) return "AIRO is waiting for a cleaner signal on this board.";
  const expectedGoals = analysis.hero?.expectedGoals ? analysis.hero.expectedGoals.toFixed(2) : null;
  const primary = analysis.primary?.label || "the main angle";
  const home = displayTeamName(match.home);
  const away = displayTeamName(match.away);
  if (state.language === "ro") {
    return expectedGoals
      ? `${home} vs ${away} are un total proiectat de ${expectedGoals} goluri, iar AIRO vede ${primary.toLowerCase()} ca semnal principal.`
      : `${home} vs ${away} ramane unul dintre cele mai puternice spoturi din snapshotul curent.`;
  }
  return expectedGoals
    ? `${home} vs ${away} projects at ${expectedGoals} total goals, with ${primary} showing as the strongest angle.`
    : `${home} vs ${away} remains one of the strongest opportunities in the current snapshot.`;
}

function buildPseudoScore(analysis) {
  const scoreGroup = analysis?.marketGroups?.find((group) => group.title === "FT Correct Score");
  const label = scoreGroup?.rows?.[0]?.label || "";
  return /^\d+\-\d+$/.test(label) ? label.replace("-", " - ") : "2 - 1";
}

function buildConfidenceBar(probability, className = "") {
  const pct = Math.max(0, Math.min(100, Math.round(Number(probability || 0) * 100)));
  return `
    <div class="confidence-bar ${className}">
      <span class="confidence-bar-fill" style="width:${pct}%"></span>
      <span class="confidence-bar-rest" style="width:${Math.max(0, 100 - pct)}%"></span>
    </div>
  `;
}

function buildConfidenceRing(probability) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(probability || 0) * 100)));
  return `
    <div class="confidence-ring-v2" style="--confidence:${pct};">
      <div class="confidence-ring-v2-inner">
        <strong>${pct}%</strong>
        <span>${state.language === "ro" ? "Confidenta" : "Confidence"}</span>
      </div>
    </div>
  `;
}

function getTopMatches(limit = 6) {
  return state.matches
    .filter((match) => String(match.day || "") === state.latestAvailableDay)
    .map((match) => ({ match, analysis: getAnalysis(match) }))
    .filter((item) => item.analysis?.primary)
    .sort((left, right) => scoreAnalysis(right.analysis) - scoreAnalysis(left.analysis))
    .slice(0, limit);
}

function getOrderedMatchDays() {
  return [...new Set((state.matches || []).map((match) => String(match.day || "")).filter(Boolean))]
    .sort((left, right) => toDayStamp(left) - toDayStamp(right));
}

function getVisibleMatches() {
  let matches = [...state.matches];
  if (state.matchFilter === "latest" && state.latestAvailableDay) {
    matches = matches.filter((match) => String(match.day || "") === state.latestAvailableDay);
  } else if (state.matchFilter === "tomorrow") {
    const ordered = getOrderedMatchDays();
    const latestIndex = ordered.indexOf(state.latestAvailableDay);
    const target = ordered[latestIndex + 1] || ordered[1] || "";
    matches = matches.filter((match) => String(match.day || "") === target);
  } else if (state.matchFilter === "weekend") {
    const ordered = getOrderedMatchDays();
    const targets = new Set(ordered.slice(0, 4));
    matches = matches.filter((match) => targets.has(String(match.day || "")));
  } else if (state.matchFilter === "featured") {
    matches = [...state.matches];
  }
  if (state.selectedLeague) {
    matches = matches.filter((match) => String(match.tournamentId) === String(state.selectedLeague));
  }
  return matches.sort((left, right) => String(left.startTime || "").localeCompare(String(right.startTime || "")));
}

function getSnapshotNotice() {
  if (!state.latestAvailableDay) return state.language === "ro" ? "Snapshot indisponibil momentan." : "Snapshot currently unavailable.";
  const generated = state.matchesGeneratedAt
    ? new Date(state.matchesGeneratedAt).toLocaleString(state.language === "ro" ? "ro-RO" : "en-US", { dateStyle: "medium", timeStyle: "short" })
    : "";
  if (state.language === "ro") {
    return `Aplicatia foloseste snapshot-ul din ${fmtDayLong(state.latestAvailableDay)}${generated ? ` • generat la ${generated}` : ""}.`;
  }
  return `The app is currently using the snapshot from ${fmtDayLong(state.latestAvailableDay)}${generated ? ` • generated at ${generated}` : ""}.`;
}

function buildSearchPool() {
  const term = normalizeText(state.searchTerm);
  return state.matches.filter((match) => {
    const haystack = normalizeText(`${match.home} ${match.away} ${match.tournamentName} ${match.categoryName}`);
    return term && haystack.includes(term);
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
    : `<div class="search-item"><div class="search-item-title">${state.language === "ro" ? "Niciun meci gasit" : "No matches found"}</div><div class="search-item-meta">${state.language === "ro" ? "Incearca alta echipa sau competitie." : "Try another team or competition."}</div></div>`;

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

function renderShellCopy() {
  document.title = "AIRO";
  el("homeGreeting").textContent = t("greeting");
  el("matchesSubtitle").textContent = t("matchesSubtitle");
  el("matchesSearchBtn").textContent = state.language === "ro" ? "Cauta" : "Search";
  el("matchesFilterBtn").textContent = state.language === "ro" ? "Filtre" : "Filters";
  el("matchesCalendarBtn").textContent = state.language === "ro" ? "Calendar" : "Calendar";
  el("navHomeBtn").lastElementChild.textContent = "Home";
  el("navMatchesBtn").lastElementChild.textContent = t("matches");
  el("navAnalysisBtn").lastElementChild.textContent = state.language === "ro" ? "Analiza" : "Analysis";
  el("navAiBtn").lastElementChild.textContent = state.language === "ro" ? "AI Chat" : "AI Chat";
  el("navProfileBtn").lastElementChild.textContent = t("profile");
  el("applyUpdateBtn").textContent = t("reloadAction");
  el("updateBanner").querySelector(".update-banner-title").textContent = t("reloadTitle");
  el("updateBanner").querySelector(".update-banner-copy").textContent = t("reloadCopy");
  el("modelSummaryModal").querySelector(".modal-kicker").textContent = t("modelPulse");
}

function renderStateCard(title, copy) {
  return `
    <article class="state-card">
      <div class="section-kicker">${escapeHtml(state.language === "ro" ? "AIRO State" : "AIRO State")}</div>
      <div class="state-title">${escapeHtml(title)}</div>
      <div class="state-copy">${escapeHtml(copy)}</div>
    </article>
  `;
}

function renderHome() {
  const topMatches = getTopMatches(5);
  const homeGreeting = el("homeGreeting");
  if (state.language === "en") {
    homeGreeting.innerHTML = '<span class="title-line">Here are today’s top</span><span class="title-line">AI match insights</span>';
  } else {
    homeGreeting.textContent = t("greeting");
  }
  el("homeSubtitle").textContent = state.latestAvailableDay
    ? `${state.language === "ro" ? "ASTAZI" : "TODAY"} • ${fmtDayLong(state.latestAvailableDay).toUpperCase()}`
    : getSnapshotNotice();

  const feed = el("homeFeedList");
  feed.innerHTML = topMatches.length
    ? topMatches.map(({ match, analysis }) => `
      <button class="home-match-card" type="button" data-open-analysis="${escapeHtml(String(match.fixtureId))}">
        <div class="home-card-left">
          <div class="home-logos-stack">
            ${badgeMarkup(match.home, "home-logo")}
            ${badgeMarkup(match.away, "home-logo away")}
          </div>
          <div class="home-match-copy">
            <div class="home-team-name">${escapeHtml(displayTeamName(match.home))}</div>
            <div class="home-team-name">${escapeHtml(displayTeamName(match.away))}</div>
            <div class="home-meta-row">${escapeHtml(match.tournamentName)}</div>
            <div class="home-kickoff-row">${escapeHtml(fmtClock(match.startTime))}</div>
          </div>
        </div>
        <div class="home-card-divider"></div>
        <div class="home-card-right">
          <div class="home-prediction-label">${escapeHtml(analysis?.primary?.label || "No signal")}</div>
          <div class="home-confidence-value">${escapeHtml(analysis?.primary ? `${Math.round(Number(analysis.primary.probability || 0) * 100)}%` : "—")}</div>
          <div class="home-confidence-caption">${state.language === "ro" ? "CONFIDENTA" : "CONFIDENCE"}</div>
          ${buildConfidenceBar(analysis?.primary?.probability)}
        </div>
        <span class="home-card-chevron" aria-hidden="true">›</span>
      </button>
    `).join("")
    : renderStateCard(
      state.language === "ro" ? "Nu exista meciuri curate pentru cardurile AIRO." : "There are no clean matches for the AIRO cards.",
      getSnapshotNotice()
    );

  feed.querySelectorAll("[data-open-analysis]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedFixtureId = button.getAttribute("data-open-analysis") || "";
      state.activeScreen = "detail";
      renderAll();
    });
  });
}

function renderMatches() {
  el("snapshotNotice").textContent = getSnapshotNotice();
  el("snapshotNotice").hidden = !state.adminMode;
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.getAttribute("data-filter") === state.matchFilter);
    if (button.getAttribute("data-filter") === "latest") button.textContent = t("filterToday");
    if (button.getAttribute("data-filter") === "tomorrow") button.textContent = t("filterTomorrow");
    if (button.getAttribute("data-filter") === "weekend") button.textContent = t("filterWeekend");
    if (button.getAttribute("data-filter") === "featured") button.textContent = t("filterAi");
  });

  const items = getVisibleMatches();
  const list = el("matchesList");
  list.innerHTML = items.length
    ? items.map((match) => {
      const analysis = getAnalysis(match);
      const confidence = analysis?.primary ? `${Math.round(Number(analysis.primary.probability || 0) * 100)}%` : "—";
      return `
        <button class="match-card" type="button" data-open-match="${escapeHtml(String(match.fixtureId))}">
          <div class="match-card-main">
            <div class="match-card-left">
              <div class="match-row-teams">
                <div class="match-team-row">
                  ${badgeMarkup(match.home, "match-logo")}
                  <div class="match-team-line">${escapeHtml(displayTeamName(match.home))}</div>
                </div>
                <div class="match-team-row">
                  ${badgeMarkup(match.away, "match-logo")}
                  <div class="match-team-line">${escapeHtml(displayTeamName(match.away))}</div>
                </div>
                <div class="match-meta">${escapeHtml(match.tournamentName)}</div>
                <div class="match-row-time">${escapeHtml(fmtClock(match.startTime))}</div>
              </div>
            </div>
            <div class="match-card-right">
              <div class="match-prediction-label">${escapeHtml(analysis?.primary?.label || "No signal")}</div>
              <div class="match-confidence-value">${escapeHtml(confidence)}</div>
              ${buildConfidenceBar(analysis?.primary?.probability)}
              <span class="match-card-chevron" aria-hidden="true">›</span>
            </div>
          </div>
        </button>
      `;
    }).join("")
    : renderStateCard(
        state.language === "ro" ? "Nu exista meciuri pentru filtrul curent." : "No matches for the current filter.",
        state.language === "ro" ? "Schimba ziua, liga sau tabul activ." : "Try another day, league or active tab."
      );

  list.querySelectorAll("[data-open-match]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedFixtureId = button.getAttribute("data-open-match") || "";
      state.activeScreen = "detail";
      renderAll();
    });
  });
}

function renderAiScreen() {
  const featured = getFeaturedMatch();
  const analysis = getAnalysis(featured);
  const topMatches = getTopMatches(3);

  el("aiSuggestedAnswer").textContent = state.language === "ro"
    ? "Cine are cel mai puternic edge astazi?"
    : "Who has the strongest edge today?";

  el("aiGeneratedAnswer").textContent = state.aiMessage
    || (featured && analysis
      ? (state.language === "ro"
        ? `${displayTeamName(featured.home)} vs ${displayTeamName(featured.away)} este spotul principal: ${analysis.primary?.label || "fara semnal clar"} la ${analysis.primary ? pct01(analysis.primary.probability) : "—"}.`
        : `${displayTeamName(featured.home)} vs ${displayTeamName(featured.away)} is the strongest spot right now: ${analysis.primary?.label || "no clear signal"} at ${analysis.primary ? pct01(analysis.primary.probability) : "—"}.`)
      : (state.language === "ro" ? "AIRO asteapta mai multe date pentru un raspuns clar." : "AIRO is waiting for more data to produce a stronger answer."));

  const grid = el("aiPromptGrid");
  const prompts = state.language === "ro"
    ? [
        "Cel mai bun meci de azi",
        "Meciuri puternice peste 2.5",
        "Analizeaza meciul principal"
      ]
    : [
        "Best match today",
        "Strong over 2.5 spots",
        "Analyze the featured match"
      ];
  grid.hidden = state.aiPromptUsed;
  grid.innerHTML = prompts.map((prompt) => `<button class="prompt-chip" type="button" data-ai-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join("");

  grid.querySelectorAll("[data-ai-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      const prompt = button.getAttribute("data-ai-prompt") || "";
      if (!featured || !analysis) return;
      state.aiPromptUsed = true;
      if (prompt.includes("featured") || prompt.includes("principal") || prompt.includes("best") || prompt.includes("meci")) {
        state.aiMessage = buildInsightSentence(featured, analysis);
      } else {
        const matches = topMatches.map((item) => `${displayTeamName(item.match.home)} vs ${displayTeamName(item.match.away)} (${item.analysis?.primary?.label || "No signal"})`).join(" • ");
        state.aiMessage = matches || state.aiMessage;
      }
      renderAiScreen();
    });
  });
}

function renderProfile() {
  el("langRoBtn").classList.toggle("is-active", state.language === "ro");
  el("langEnBtn").classList.toggle("is-active", state.language === "en");

  const settings = el("profileScreen").querySelectorAll(".settings-item span");
  if (settings[0]) settings[0].textContent = t("account");
  if (settings[1]) settings[1].textContent = t("privacy");
  if (settings[2]) settings[2].textContent = t("support");

  const titleNodes = el("profileScreen").querySelectorAll(".section-title");
  if (titleNodes[0]) titleNodes[0].textContent = t("appRefresh");
  if (titleNodes[1]) titleNodes[1].textContent = t("language");
  if (titleNodes[2]) titleNodes[2].textContent = t("savedMatches");

  const profileChips = el("profileScreen").querySelectorAll(".section-chip");
  if (profileChips[0]) profileChips[0].textContent = t("manual");
  if (profileChips[1]) profileChips[1].textContent = t("settings");
  if (profileChips[2]) profileChips[2].textContent = t("favorites");

  el("profileRefreshBtn").textContent = t("refreshApp");

  const favoritesList = el("profileFavoritesList");
  const favoriteMatches = [...state.favoriteFixtureIds]
    .map((fixtureId) => findMatchByFixtureId(fixtureId))
    .filter(Boolean)
    .slice(0, 4);

  favoritesList.innerHTML = favoriteMatches.length
    ? favoriteMatches.map((match) => `
      <button class="favorite-row" type="button" data-open-favorite="${escapeHtml(String(match.fixtureId))}">
        <div class="favorite-row-match">
          ${badgeMarkup(match.home, "mini-crest")}
          <div>
            <div class="favorite-row-title">${escapeHtml(displayTeamName(match.home))} vs ${escapeHtml(displayTeamName(match.away))}</div>
            <div class="favorite-row-meta">${escapeHtml(match.tournamentName)} • ${escapeHtml(fmtDayLong(match.day))}</div>
          </div>
        </div>
        <strong>›</strong>
      </button>
    `).join("")
    : renderStateCard(
        state.language === "ro" ? "Nu ai meciuri salvate." : "No saved matches yet.",
        state.language === "ro" ? "Salveaza meciuri din Home sau Matches pentru acces rapid aici." : "Save matches from Home or Matches for quick access here."
      );

  favoritesList.querySelectorAll("[data-open-favorite]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedFixtureId = button.getAttribute("data-open-favorite") || "";
      state.activeScreen = "detail";
      renderAll();
    });
  });
}

function buildOverviewMarkup(match, analysis) {
  const primary = analysis?.primary;
  return `
    <article class="analysis-verdict-card">
      <div class="analysis-verdict-header">
        <div>
          <div class="section-kicker">AI Verdict</div>
          <h3>${escapeHtml(primary?.label || "No signal")}</h3>
          <div class="analysis-confidence-line">${escapeHtml(primary ? `${pct01(primary.probability)} ${state.language === "ro" ? "CONFIDENTA" : "CONFIDENCE"}` : "—")}</div>
        </div>
        ${buildConfidenceRing(primary?.probability)}
      </div>
      <p class="analysis-summary-copy">${escapeHtml(buildInsightSentence(match, analysis))}</p>
    </article>
  `;
}

function buildPredictionsMarkup(analysis) {
  const sourceRows = analysis?.canonicalRows || [];
  const preferredMatchers = [
    /over 2\.5/i,
    /\bbtts\b|both teams to score/i,
    /home win|\b1\b/i,
    /draw|\bx\b/i
  ];
  const rows = preferredMatchers
    .map((pattern) => sourceRows.find((row) => pattern.test(String(row.label || ""))))
    .filter(Boolean);
  const fallbackRows = sourceRows.filter((row) => !rows.includes(row)).slice(0, Math.max(0, 4 - rows.length));
  const finalRows = [...rows, ...fallbackRows].slice(0, 4);
  return `
    <article class="analysis-section-card">
      <div class="analysis-section-title">${state.language === "ro" ? "Predictii cheie" : "Key predictions"}</div>
      <div class="analysis-predictions-grid">
        ${finalRows.map((row) => `
          <div class="prediction-tile">
            <div class="prediction-tile-title">${escapeHtml(row.label)}</div>
            <div class="prediction-tile-value">${escapeHtml(pct01(row.probability))}</div>
            <div class="prediction-tile-caption">${state.language === "ro" ? "CONFIDENTA" : "CONFIDENCE"}</div>
            ${buildConfidenceBar(row.probability)}
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function buildFormMarkup(match, historyEntry) {
  const home = historyEntry?.homeStats;
  const away = historyEntry?.awayStats;
  const homeForm = String(home?.recentFormHome || "WWDWL").split("");
  const awayForm = String(away?.recentFormAway || "WDWLL").split("");
  const chipClass = (result) => result === "W" ? "win" : result === "D" ? "draw" : "loss";
  return `
    <article class="analysis-section-card">
      <div class="analysis-section-title">${state.language === "ro" ? "Forma echipelor (ultimele 5)" : "Team form (last 5 matches)"}</div>
      <div class="team-form-grid">
        <div class="team-form-block">
          <div class="team-form-head">
            ${badgeMarkup(match.home, "mini-crest")}
            <span>${escapeHtml(displayTeamName(match.home))}</span>
          </div>
          <div class="compare-form-strip">${homeForm.map((item) => `<span class="form-chip ${chipClass(item)}">${escapeHtml(item)}</span>`).join("")}</div>
          <div class="team-form-stats">
            <div><strong>${escapeHtml(home?.homeGF?.toFixed(1) || "—")}</strong><span>${state.language === "ro" ? "Medie goluri marcate" : "Avg. goals scored"}</span></div>
            <div><strong>${escapeHtml(home?.homeGA?.toFixed(1) || "—")}</strong><span>${state.language === "ro" ? "Medie goluri primite" : "Avg. goals conceded"}</span></div>
          </div>
        </div>
        <div class="team-form-block">
          <div class="team-form-head">
            ${badgeMarkup(match.away, "mini-crest")}
            <span>${escapeHtml(displayTeamName(match.away))}</span>
          </div>
          <div class="compare-form-strip">${awayForm.map((item) => `<span class="form-chip ${chipClass(item)}">${escapeHtml(item)}</span>`).join("")}</div>
          <div class="team-form-stats">
            <div><strong>${escapeHtml(away?.awayGF?.toFixed(1) || "—")}</strong><span>${state.language === "ro" ? "Medie goluri marcate" : "Avg. goals scored"}</span></div>
            <div><strong>${escapeHtml(away?.awayGA?.toFixed(1) || "—")}</strong><span>${state.language === "ro" ? "Medie goluri primite" : "Avg. goals conceded"}</span></div>
          </div>
        </div>
      </div>
    </article>
  `;
}

function buildH2HMarkup(match, analysis) {
  const rows = [
    { label: "Over 2.5 Goals", value: `${Math.round((analysis?.metrics?.over25Ft || 0) * 100)}%` },
    { label: "BTTS", value: `${Math.round((analysis?.metrics?.bttsFt || 0) * 100)}%` },
    { label: state.language === "ro" ? "Medie goluri" : "Avg. goals", value: analysis?.hero?.expectedGoals?.toFixed(1) || "—" }
  ];
  return `
    <article class="analysis-section-card">
      <div class="analysis-section-title">${state.language === "ro" ? "Head to head (ultimele 5)" : "Head to head (last 5 meetings)"}</div>
      <div class="h2h-grid">
        ${rows.map((row) => `
          <div class="h2h-stat">
            <strong>${escapeHtml(row.value)}</strong>
            <span>${escapeHtml(row.label)}</span>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function buildStatsMarkupWithComparison(match, analysis, historyEntry) {
  const homeStats = historyEntry?.homeStats;
  const awayStats = historyEntry?.awayStats;
  const rows = [
    { label: state.language === "ro" ? "Goluri / meci" : "Goals / match", home: homeStats?.homeGF?.toFixed(2) ?? "—", away: awayStats?.awayGF?.toFixed(2) ?? "—" },
    { label: state.language === "ro" ? "Goluri primite" : "Goals conceded", home: homeStats?.homeGA?.toFixed(2) ?? "—", away: awayStats?.awayGA?.toFixed(2) ?? "—" },
    { label: state.language === "ro" ? "Cornere / meci" : "Corners / match", home: homeStats?.homeCornersFor?.toFixed(1) ?? "—", away: awayStats?.awayCornersFor?.toFixed(1) ?? "—" },
    { label: state.language === "ro" ? "Cartonase / meci" : "Cards / match", home: homeStats?.homeYCFor?.toFixed(1) ?? "—", away: awayStats?.awayYCFor?.toFixed(1) ?? "—" }
  ];

  return `
    <article class="analysis-section-card">
      <div class="analysis-section-title">${state.language === "ro" ? "Statistici avansate" : "Advanced stats"}</div>
      <div class="compare-table">
        ${rows.map((row) => `
          <div class="compare-row">
            <strong>${escapeHtml(String(row.home))}</strong>
            <div class="compare-row-label">${escapeHtml(row.label)}</div>
            <strong>${escapeHtml(String(row.away))}</strong>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function renderDetail() {
  const match = findMatchByFixtureId(state.selectedFixtureId) || getFeaturedMatch();
  if (!match) return;
  if (!["overview", "predictions", "form", "h2h", "stats"].includes(state.detailTab)) {
    state.detailTab = "overview";
  }
  const analysis = getAnalysis(match);
  const historyEntry = getHistEntry(match.fixtureId);

  el("detailLeagueLabel").textContent = match.tournamentName;
  el("detailKickoffLabel").textContent = fmtTime(match.startTime);
  el("detailPseudoScore").textContent = analysis?.primary?.label || buildPseudoScore(analysis);
  el("detailMatchDayLabel").textContent = state.language === "ro" ? "Azi" : "Today";
  setBadgeVisual("detailHomeBadge", match.home);
  setBadgeVisual("detailAwayBadge", match.away);
  el("detailHomeName").textContent = displayTeamName(match.home);
  el("detailAwayName").textContent = displayTeamName(match.away);

  document.querySelectorAll("[data-detail-tab]").forEach((button) => {
    const tab = button.getAttribute("data-detail-tab");
    button.classList.toggle("is-active", tab === state.detailTab);
    if (tab === "overview") button.textContent = t("detailOverview");
    if (tab === "predictions") button.textContent = t("detailPredictions");
    if (tab === "form") button.textContent = t("detailForm");
    if (tab === "h2h") button.textContent = t("detailH2H");
    if (tab === "stats") button.textContent = t("detailStats");
  });

  el("detailOverviewTab").hidden = state.detailTab !== "overview";
  el("detailPredictionsTab").hidden = state.detailTab !== "predictions";
  el("detailFormTab").hidden = state.detailTab !== "form";
  el("detailH2HTab").hidden = state.detailTab !== "h2h";
  el("detailStatsTab").hidden = state.detailTab !== "stats";

  el("detailOverviewTab").innerHTML = analysis ? buildOverviewMarkup(match, analysis) : "";
  el("detailPredictionsTab").innerHTML = analysis ? buildPredictionsMarkup(analysis) : "";
  el("detailFormTab").innerHTML = analysis ? buildFormMarkup(match, historyEntry) : "";
  el("detailH2HTab").innerHTML = analysis ? buildH2HMarkup(match, analysis) : "";
  el("detailStatsTab").innerHTML = analysis ? buildStatsMarkupWithComparison(match, analysis, historyEntry) : "";

  el("detailOverviewTab").querySelectorAll("[data-ask-ai-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeScreen = "ai";
      state.aiMessage = buildInsightSentence(match, analysis);
      renderAll();
    });
  });
}

function renderBacktestModal() {
  const rateChip = el("modelRateChip");
  const summary = el("backtestSummary");
  const markets = el("backtestMarkets");
  const copy = el("modelPopoverCopy");
  const data = state.backtest;

  if (!data) {
    rateChip.textContent = "—";
    summary.innerHTML = "";
    markets.innerHTML = "";
    copy.textContent = state.language === "ro" ? "Nu exista inca un rezumat recent." : "There is no recent summary yet.";
    return;
  }

  rateChip.textContent = data.hitRate == null ? "—" : `${data.hitRate}%`;
  copy.textContent = data.hitRate == null
    ? (state.language === "ro" ? "Nu exista suficient istoric recent pentru o evaluare clara." : "Not enough recent history for a clear evaluation.")
    : (state.language === "ro"
      ? `${data.hitRate}% rata recenta, cu ${data.wins} recomandari corecte din ${data.sampleSize} meciuri evaluate.`
      : `${data.hitRate}% recent hit rate, with ${data.wins} successful picks from ${data.sampleSize} graded matches.`);

  summary.innerHTML = `
    <article class="backtest-card">
      <div class="backtest-label">${state.language === "ro" ? "Rata recenta" : "Recent hit rate"}</div>
      <div class="backtest-value">${data.hitRate == null ? "—" : `${data.hitRate}%`}</div>
      <div class="backtest-copy">${escapeHtml(state.language === "ro" ? `${data.wins} recomandari reusite.` : `${data.wins} successful recommendations.`)}</div>
    </article>
    <article class="backtest-card">
      <div class="backtest-label">No bet</div>
      <div class="backtest-value">${escapeHtml(String(data.noBet || 0))}</div>
      <div class="backtest-copy">${escapeHtml(state.language === "ro" ? "Meciurile in care modelul nu a fortat o selectie." : "Matches where AIRO preferred not to force a pick.")}</div>
    </article>
  `;

  markets.innerHTML = Object.entries(data.byMarket || {}).slice(0, 5).map(([label, item]) => `
    <article class="backtest-market">
      <div>
        <div class="backtest-market-title">${escapeHtml(label)}</div>
        <div class="backtest-market-meta">${escapeHtml(`${item.picks} picks • ${item.wins} wins • ${item.losses} losses`)}</div>
      </div>
      <div class="backtest-market-rate">${item.hitRate == null ? "—" : `${item.hitRate}%`}</div>
    </article>
  `).join("");
}

function formatAdminDateTime(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return date.toLocaleString(state.language === "ro" ? "ro-RO" : "en-US", { dateStyle: "medium", timeStyle: "short" });
}

function formatRefreshSource(source) {
  const raw = String(source || "").trim().toLowerCase();
  if (raw === "scheduled") return state.language === "ro" ? "Programat" : "Scheduled";
  if (raw === "watchdog") return state.language === "ro" ? "Fallback watchdog" : "Watchdog fallback";
  if (raw === "manual") return state.language === "ro" ? "Manual" : "Manual";
  return state.language === "ro" ? "Necunoscut" : "Unknown";
}

function renderAdminWatchdog() {
  const status = state.adminWatchdogStatus || {};
  el("adminWatchdogPanel").innerHTML = `
    <div class="admin-watchdog-item">
      <div class="admin-watchdog-label">${state.language === "ro" ? "Meciuri in snapshot" : "Matches in snapshot"}</div>
      <div class="admin-watchdog-value">${escapeHtml(String(state.matches.length || 0))}</div>
      <div class="admin-watchdog-meta">${escapeHtml(state.language === "ro" ? `Ultima zi: ${state.latestAvailableDay || "N/A"}` : `Latest day: ${state.latestAvailableDay || "N/A"}`)}</div>
    </div>
    <div class="admin-watchdog-item">
      <div class="admin-watchdog-label">${state.language === "ro" ? "Ultimul refresh reusit" : "Last successful refresh"}</div>
      <div class="admin-watchdog-value">${escapeHtml(formatAdminDateTime(status.lastSuccessfulRefreshUTC || state.matchesGeneratedAt))}</div>
      <div class="admin-watchdog-meta">${escapeHtml(formatRefreshSource(status.lastSuccessfulRefreshSource))}</div>
    </div>
    <div class="admin-watchdog-item">
      <div class="admin-watchdog-label">${state.language === "ro" ? "Motiv fallback" : "Fallback reason"}</div>
      <div class="admin-watchdog-meta">${escapeHtml(status.lastFallbackReason || "N/A")}</div>
    </div>
  `;
}

function renderBottomNav() {
  const map = {
    home: "navHomeBtn",
    matches: "navMatchesBtn",
    detail: "navAnalysisBtn",
    ai: "navAiBtn",
    profile: "navProfileBtn"
  };
  Object.entries(map).forEach(([screen, id]) => {
    el(id).classList.toggle("is-active", state.activeScreen === screen);
  });
}

function renderScreens() {
  el("homeScreen").hidden = state.activeScreen !== "home";
  el("matchesScreen").hidden = state.activeScreen !== "matches";
  el("aiScreen").hidden = state.activeScreen !== "ai";
  el("profileScreen").hidden = state.activeScreen !== "profile";
  el("detailScreen").hidden = state.activeScreen !== "detail";
  el("backFromDetailBtn").hidden = state.activeScreen !== "detail";
  el("appTopbar").hidden = state.activeScreen === "detail";
  if (state.activeScreen === "detail") el("searchDrawer").hidden = true;
}

function renderAll() {
  ensureSelectedFixture();
  renderShellCopy();
  renderScreens();
  renderBottomNav();
  renderSearchResults();
  renderBacktestModal();
  renderAdminWatchdog();
  renderHome();
  renderMatches();
  renderAiScreen();
  renderProfile();
  renderDetail();
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

  el("navHomeBtn").addEventListener("click", () => { state.activeScreen = "home"; renderAll(); });
  el("navMatchesBtn").addEventListener("click", () => { state.activeScreen = "matches"; renderAll(); });
  el("navAnalysisBtn").addEventListener("click", () => { state.activeScreen = "detail"; renderAll(); });
  el("navAiBtn").addEventListener("click", () => { state.activeScreen = "ai"; renderAll(); });
  el("navProfileBtn").addEventListener("click", () => { state.activeScreen = "profile"; renderAll(); });
  el("backFromDetailBtn").addEventListener("click", () => { state.activeScreen = "matches"; renderAll(); });
  el("analysisBackBtn").addEventListener("click", () => { state.activeScreen = "home"; renderAll(); });
  el("profileRefreshBtn").addEventListener("click", () => { window.location.reload(); });
  
  const bindMatchFilterTabs = () => {
    document.querySelectorAll("[data-filter]").forEach((button) => {
      button.onclick = () => {
        state.matchFilter = button.getAttribute("data-filter") || "latest";
        renderMatches();
      };
    });
  };
  bindMatchFilterTabs();

  el("matchesSearchBtn").addEventListener("click", () => {
    const drawer = el("searchDrawer");
    drawer.hidden = false;
    state.activeScreen = "matches";
    renderAll();
    el("searchInput").focus();
  });

  el("matchesFilterBtn").addEventListener("click", () => {
    state.matchFilter = state.matchFilter === "featured" ? "latest" : "featured";
    renderMatches();
  });

  el("matchesCalendarBtn").addEventListener("click", () => {
    state.matchFilter = state.matchFilter === "weekend" ? "latest" : "weekend";
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

  el("useFeaturedPromptBtn").addEventListener("click", () => {
    const featured = getFeaturedMatch();
    const analysis = getAnalysis(featured);
    state.aiPromptUsed = true;
    state.aiMessage = buildInsightSentence(featured, analysis);
    renderAiScreen();
  });

  el("closeModelSummaryBtn").addEventListener("click", () => { el("modelSummaryModal").hidden = true; });
  el("modelSummaryBackdrop").addEventListener("click", () => { el("modelSummaryModal").hidden = true; });

  el("adminModeTrigger").addEventListener("click", () => {
    adminTapCount += 1;
    clearTimeout(adminTapTimer);
    adminTapTimer = window.setTimeout(() => { adminTapCount = 0; }, 900);
    if (adminTapCount < 5) return;
    adminTapCount = 0;
    if (!state.adminMode) {
      const code = window.prompt(state.language === "ro" ? "Cod admin" : "Admin code");
      if (code !== ADMIN_MODE_CODE) return;
      setAdminMode(true);
    }
    el("adminWatchdogModal").hidden = false;
  });

  el("closeAdminWatchdogBtn").addEventListener("click", () => { el("adminWatchdogModal").hidden = true; });
  el("adminWatchdogBackdrop").addEventListener("click", () => { el("adminWatchdogModal").hidden = true; });
  el("disableAdminModeBtn").addEventListener("click", () => {
    setAdminMode(false);
    el("adminWatchdogModal").hidden = true;
  });

  el("langRoBtn").addEventListener("click", () => { setLanguage("ro"); renderAll(); });
  el("langEnBtn").addEventListener("click", () => { setLanguage("en"); renderAll(); });
}

async function init() {
  const leaguesPayload = await getJson("./data/ui/leagues.json").catch(() => ({ leagues: [] }));
  const matchesPayload = await getJson("./data/ui/matches.json").catch(() => ({ matches: [] }));
  const historyPayload = await getJson("./data/ui/history_stats.json").catch(() => ({ byFixtureId: {} }));
  const backtestPayload = await getJson("./data/ui/backtest_summary.json").catch(() => null);
  const adminPayload = await getJson("./data/ui/admin_watchdog_status.json").catch(() => null);

  state.catalogLeagues = leaguesPayload.leagues || [];
  state.matches = matchesPayload.matches || [];
  state.matchesGeneratedAt = matchesPayload.generatedAtUTC || "";
  state.latestAvailableDay = getLatestAvailableDay(state.matches);
  state.historyByFixtureId = historyPayload.byFixtureId || {};
  state.backtest = backtestPayload;
  state.adminWatchdogStatus = adminPayload;
  restoreAdminMode();
  restoreLanguage();
  ensureSelectedFixture();
  bindActions();
  renderAll();
  await registerServiceWorker();
}

init();
