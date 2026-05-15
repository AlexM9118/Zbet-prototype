import { getJson, fmtDayLong, fmtTime, fmtOdds, pct01, escapeHtml } from "./js/utils.mjs";
import { buildMatchAnalysis } from "./js/zbet-engine.mjs";

const APP_VERSION = "26";
const UPDATE_BANNER_DISMISSED_KEY = "kyro-update-dismissed";
const ADMIN_MODE_STORAGE_KEY = "kyro-admin-mode";
const LANGUAGE_STORAGE_KEY = "kyro-language";
const ADMIN_MODE_CODE = "18111991";

const COPY = {
  en: {
    greeting: "Good evening, Alex",
    homeSubtitle: "Here’s what KYRO found for you.",
    exploreAll: "Explore all",
    topInsight: "Top AI Insight",
    viewAnalysis: "View Analysis",
    askKyro: "Ask KYRO",
    topInsights: "Top AI insights",
    latest: "Latest",
    matches: "Matches",
    matchesSubtitle: "Intelligent match explorer.",
    reset: "Reset",
    filterToday: "Today",
    filterUpcoming: "Upcoming",
    filterAi: "AI Picks",
    aiTitle: "KYRO AI",
    aiSubtitle: "Ask sharper questions. Read the match deeper.",
    online: "Online",
    aiInput: "Ask anything…",
    alerts: "Smart Alerts",
    alertsSubtitle: "Real-time triggers around momentum, goals and risk.",
    profile: "Profile",
    profileSubtitle: "Settings, reports and your intelligence layer.",
    account: "Account",
    notifications: "Notifications",
    privacy: "Data & Privacy",
    language: "Language",
    settings: "Settings",
    favorites: "Favorites",
    reports: "Reports",
    trackedTeams: "Tracked teams",
    recentHitRate: "Recent hit rate",
    kyroPlus: "KYRO+",
    kyroPlusTitle: "Advanced mode for deeper football intelligence.",
    unlockKyroPlus: "Unlock KYRO+",
    kyroPlusSubtext: "Advanced football analysis powered by KYRO.",
    detailOverview: "Overview",
    detailInsight: "AI Insight",
    detailStats: "Stats",
    detailCompare: "Compare",
    modelPulse: "Recent model pulse",
    signalRate: "KYRO signal rate",
    reloadTitle: "A new version is ready",
    reloadCopy: "Reload the app to switch to the latest KYRO interface.",
    reloadAction: "Reload"
  },
  ro: {
    greeting: "Buna seara, Alex",
    homeSubtitle: "Iata ce a gasit KYRO pentru tine.",
    exploreAll: "Vezi tot",
    topInsight: "Insight AI principal",
    viewAnalysis: "Vezi analiza",
    askKyro: "Intreaba KYRO",
    topInsights: "Top insight-uri AI",
    latest: "Ultimul snapshot",
    matches: "Meciuri",
    matchesSubtitle: "Explorator inteligent de meciuri.",
    reset: "Reset",
    filterToday: "Azi",
    filterUpcoming: "Viitoare",
    filterAi: "Picks AI",
    aiTitle: "KYRO AI",
    aiSubtitle: "Pune intrebari mai bune. Citeste meciul mai profund.",
    online: "Online",
    aiInput: "Intreaba orice…",
    alerts: "Alerte inteligente",
    alertsSubtitle: "Trigger-e in timp real pentru momentum, goluri si risc.",
    profile: "Profil",
    profileSubtitle: "Setari, rapoarte si stratul tau de inteligenta.",
    account: "Cont",
    notifications: "Notificari",
    privacy: "Date si confidentialitate",
    language: "Limba",
    settings: "Setari",
    favorites: "Favorite",
    reports: "Rapoarte",
    trackedTeams: "Echipe urmarite",
    recentHitRate: "Rata recenta",
    kyroPlus: "KYRO+",
    kyroPlusTitle: "Mod avansat pentru inteligenta fotbalistica mai profunda.",
    unlockKyroPlus: "Deblocheaza KYRO+",
    kyroPlusSubtext: "Analiza avansata de fotbal, sustinuta de KYRO.",
    detailOverview: "Prezentare",
    detailInsight: "Insight AI",
    detailStats: "Statistici",
    detailCompare: "Comparatie",
    modelPulse: "Puls model recent",
    signalRate: "Rata de semnal KYRO",
    reloadTitle: "Este gata o versiune noua",
    reloadCopy: "Reincarca aplicatia pentru cea mai noua interfata KYRO.",
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
  favoriteFixtureIds: new Set()
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
  const mono = monogramFor(name);
  const palette = badgePalette(name);
  const style = `--badge-primary:${palette.primary};--badge-secondary:${palette.secondary};--badge-border:${palette.border};`;
  return `<div class="${className}" style="${style}">${escapeHtml(mono)}</div>`;
}

function setBadgeVisual(id, name) {
  const node = el(id);
  if (!node) return;
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
  if (!match || !analysis) return "KYRO is waiting for a cleaner signal on this board.";
  const expectedGoals = analysis.hero?.expectedGoals ? analysis.hero.expectedGoals.toFixed(2) : null;
  const primary = analysis.primary?.label || "the main angle";
  const home = displayTeamName(match.home);
  const away = displayTeamName(match.away);
  if (state.language === "ro") {
    return expectedGoals
      ? `${home} vs ${away} are un total proiectat de ${expectedGoals} goluri, iar KYRO vede ${primary.toLowerCase()} ca semnal principal.`
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

function getTopMatches(limit = 6) {
  return state.matches
    .filter((match) => String(match.day || "") === state.latestAvailableDay)
    .map((match) => ({ match, analysis: getAnalysis(match) }))
    .filter((item) => item.analysis?.primary)
    .sort((left, right) => scoreAnalysis(right.analysis) - scoreAnalysis(left.analysis))
    .slice(0, limit);
}

function getVisibleMatches() {
  let matches = [...state.matches];
  if (state.matchFilter === "latest" && state.latestAvailableDay) {
    matches = matches.filter((match) => String(match.day || "") === state.latestAvailableDay);
  } else if (state.matchFilter === "featured") {
    matches = getTopMatches(16).map((item) => item.match);
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
  document.title = "KYRO";
  el("homeGreeting").textContent = t("greeting");
  el("homeSubtitle").textContent = t("homeSubtitle");
  el("openMatchesFromHomeBtn").textContent = t("exploreAll");
  el("feedDateChip").textContent = t("latest");
  el("matchesSubtitle").textContent = t("matchesSubtitle");
  el("resetLeagueFilterBtn").textContent = t("reset");
  el("navHomeBtn").lastElementChild.textContent = "Home";
  el("navMatchesBtn").lastElementChild.textContent = t("matches");
  el("navAiBtn").lastElementChild.textContent = "AI";
  el("navAlertsBtn").lastElementChild.textContent = state.language === "ro" ? "Alerte" : "Alerts";
  el("navProfileBtn").lastElementChild.textContent = t("profile");
  el("applyUpdateBtn").textContent = t("reloadAction");
  el("updateBanner").querySelector(".update-banner-title").textContent = t("reloadTitle");
  el("updateBanner").querySelector(".update-banner-copy").textContent = t("reloadCopy");
  el("modelSummaryModal").querySelector(".modal-kicker").textContent = t("modelPulse");
}

function renderHome() {
  const featured = getFeaturedMatch();
  const analysis = getAnalysis(featured);
  const topMatches = getTopMatches(4);

  if (!featured || !analysis) {
    el("heroMatchTitle").textContent = state.language === "ro" ? "Nu exista un meci principal in snapshot" : "No featured match in the snapshot";
    el("heroMatchMeta").textContent = getSnapshotNotice();
    return;
  }

  el("heroMatchTitle").textContent = `${displayTeamName(featured.home)} vs ${displayTeamName(featured.away)}`;
  el("heroMatchMeta").textContent = `${featured.tournamentName} • ${fmtDayLong(featured.day)} • ${fmtTime(featured.startTime)}`;
  el("heroInsight").textContent = buildInsightSentence(featured, analysis);
  el("heroConfidence").textContent = analysis.primary ? pct01(analysis.primary.probability) : "—";
  el("heroPrimaryPick").textContent = analysis.primary?.label || "—";
  el("heroSecondaryPick").textContent = analysis.secondary?.label || "—";
  el("heroMomentum").textContent = analysis.hero?.pulseDelta != null ? `${analysis.hero.pulseDelta > 0 ? "+" : ""}${analysis.hero.pulseDelta.toFixed(1)}` : "—";
  setBadgeVisual("heroHomeBadge", featured.home);
  setBadgeVisual("heroAwayBadge", featured.away);
  el("heroHomeName").textContent = displayTeamName(featured.home);
  el("heroAwayName").textContent = displayTeamName(featured.away);

  const feed = el("homeFeedList");
  const types = ["signal", "momentum", "value", "signal"];
  const labels = {
    signal: state.language === "ro" ? "Strong Signal" : "Strong Signal",
    momentum: state.language === "ro" ? "Momentum Pick" : "Momentum Pick",
    value: state.language === "ro" ? "Value Detected" : "Value Detected"
  };

  feed.innerHTML = topMatches.map(({ match, analysis: cardAnalysis }, index) => {
    const type = types[index] || "signal";
    const excerpt = buildInsightSentence(match, cardAnalysis);
    return `
      <article class="feed-card">
        <div class="feed-card-top">
          <div>
            <div class="signal-tag${type === "momentum" ? " warn" : type === "value" ? " value" : ""}">${escapeHtml(labels[type])}</div>
            <h3>${escapeHtml(displayTeamName(match.home))} vs ${escapeHtml(displayTeamName(match.away))}</h3>
            <div class="feed-meta">${escapeHtml(match.tournamentName)} • ${escapeHtml(fmtTime(match.startTime))}</div>
          </div>
          <div class="confidence-mini">${escapeHtml(cardAnalysis?.primary ? pct01(cardAnalysis.primary.probability) : "—")}</div>
        </div>
        <div class="feed-excerpt">${escapeHtml(excerpt)}</div>
        <div class="feed-bottom">
          <button class="cta-button" type="button" data-open-analysis="${escapeHtml(String(match.fixtureId))}">${escapeHtml(t("viewAnalysis"))}</button>
          <div class="feed-actions">
            <button class="icon-button small-icon" type="button" data-toggle-favorite="${escapeHtml(String(match.fixtureId))}">${state.favoriteFixtureIds.has(String(match.fixtureId)) ? "★" : "☆"}</button>
            <button class="icon-button small-icon" type="button" data-open-alerts>${state.language === "ro" ? "◌" : "◌"}</button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  feed.querySelectorAll("[data-open-analysis]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedFixtureId = button.getAttribute("data-open-analysis") || "";
      state.activeScreen = "detail";
      renderAll();
    });
  });

  feed.querySelectorAll("[data-toggle-favorite]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-toggle-favorite") || "";
      if (state.favoriteFixtureIds.has(id)) state.favoriteFixtureIds.delete(id);
      else state.favoriteFixtureIds.add(id);
      renderHome();
      renderProfile();
    });
  });

  feed.querySelectorAll("[data-open-alerts]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeScreen = "alerts";
      renderAll();
    });
  });
}

function renderMatches() {
  el("snapshotNotice").textContent = getSnapshotNotice();
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.getAttribute("data-filter") === state.matchFilter);
    if (button.getAttribute("data-filter") === "latest") button.textContent = t("filterToday");
    if (button.getAttribute("data-filter") === "all") button.textContent = t("filterUpcoming");
    if (button.getAttribute("data-filter") === "featured") button.textContent = t("filterAi");
  });

  const leagueCatalog = getLeagueCatalog();
  const chipRow = el("leagueChipRow");
  chipRow.innerHTML = `
    <button class="chip${state.selectedLeague ? "" : " is-active"}" type="button" data-chip-league="">${state.language === "ro" ? "Toate ligile" : "All leagues"}</button>
    ${leagueCatalog.slice(0, 10).map((league) => `
      <button class="chip${state.selectedLeague === league.id ? " is-active" : ""}" type="button" data-chip-league="${escapeHtml(league.id)}">${escapeHtml(league.tournamentName)}</button>
    `).join("")}
  `;

  chipRow.querySelectorAll("[data-chip-league]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedLeague = button.getAttribute("data-chip-league") || "";
      renderMatches();
    });
  });

  const items = getVisibleMatches();
  const list = el("matchesList");
  list.innerHTML = items.length
    ? items.map((match) => {
      const analysis = getAnalysis(match);
      const primary = analysis?.primary?.label || "No signal";
      const tags = [
        primary,
        analysis?.secondary?.label || "Plan B pending",
        analysis?.metrics?.corners?.lt ? `Corners ${analysis.metrics.corners.lt.toFixed(1)}` : null
      ].filter(Boolean).slice(0, 3);
      const homeBadge = badgeMarkup(match.home, "mini-crest");
      const awayBadge = badgeMarkup(match.away, "mini-crest");
      return `
        <button class="match-card" type="button" data-open-match="${escapeHtml(String(match.fixtureId))}">
          <div class="match-row-top">
            <div class="match-row-title">
              ${homeBadge}
              <div class="match-row-teams">
                <div class="match-title">${escapeHtml(displayTeamName(match.home))}</div>
                <div class="match-meta">${escapeHtml(displayTeamName(match.away))}</div>
              </div>
            </div>
            <div>
              <div class="confidence-mini">${escapeHtml(analysis?.primary ? pct01(analysis.primary.probability) : "—")}</div>
              <div class="match-row-time">${escapeHtml(fmtTime(match.startTime))}</div>
            </div>
          </div>
          <div class="match-meta">${escapeHtml(match.tournamentName)} • ${escapeHtml(match.categoryName)}</div>
          <div class="match-tags">
            ${tags.map((tag) => `<span class="match-tag">${escapeHtml(tag)}</span>`).join("")}
          </div>
        </button>
      `;
    }).join("")
    : `<article class="match-card"><div class="match-title">${state.language === "ro" ? "Nu exista meciuri pentru filtrul curent." : "No matches for the current filter."}</div><div class="match-meta">${state.language === "ro" ? "Schimba ziua sau competitia." : "Try another filter or league."}</div></article>`;

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
      : (state.language === "ro" ? "KYRO asteapta mai multe date pentru un raspuns clar." : "KYRO is waiting for more data to produce a stronger answer."));

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
  grid.innerHTML = prompts.map((prompt) => `<button class="prompt-chip" type="button" data-ai-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join("");

  grid.querySelectorAll("[data-ai-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      const prompt = button.getAttribute("data-ai-prompt") || "";
      if (!featured || !analysis) return;
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

function renderAlerts() {
  const featured = getFeaturedMatch();
  const analysis = getAnalysis(featured);
  const alerts = [
    {
      title: state.language === "ro" ? "Goal Probability Spike" : "Goal Probability Spike",
      copy: featured && analysis
        ? (state.language === "ro"
          ? `${displayTeamName(featured.home)} vs ${displayTeamName(featured.away)} are ${analysis.hero?.expectedGoals?.toFixed(2) || "—"} goluri estimate.`
          : `${displayTeamName(featured.home)} vs ${displayTeamName(featured.away)} projects ${analysis.hero?.expectedGoals?.toFixed(2) || "—"} goals.`)
        : "Featured board signal.",
      minute: "15′"
    },
    {
      title: state.language === "ro" ? "Momentum Change" : "Momentum Change",
      copy: state.language === "ro" ? "KYRO urmareste meciurile cu schimbare brusca de ritm." : "KYRO watches for aggressive shifts in match tempo.",
      minute: "38′"
    },
    {
      title: state.language === "ro" ? "Risk Alert" : "Risk Alert",
      copy: state.language === "ro" ? "Meciurile cu semnal instabil sunt filtrate mai devreme." : "Low-conviction matches are flagged earlier and filtered faster.",
      minute: "52′"
    },
    {
      title: state.language === "ro" ? "Late Goal Probability" : "Late Goal Probability",
      copy: state.language === "ro" ? "Activ pentru meciurile cu presiune ridicata dupa minutul 70." : "Enabled for matches with strong late pressure after minute 70.",
      minute: "70′"
    }
  ];

  el("alertsList").innerHTML = alerts.map((alert) => `
    <article class="alert-card">
      <div class="alert-row-top">
        <div>
          <div class="section-title">${escapeHtml(alert.title)}</div>
          <div class="alert-meta">${escapeHtml(alert.minute)}</div>
        </div>
        <div class="alert-toggle" aria-hidden="true"></div>
      </div>
      <div class="alert-copy">${escapeHtml(alert.copy)}</div>
    </article>
  `).join("");
}

function renderProfile() {
  el("favoriteTeamsCount").textContent = String(state.favoriteFixtureIds.size || getTopMatches(4).length);
  el("reportsAccuracy").textContent = state.backtest?.hitRate != null ? `${state.backtest.hitRate}%` : "—";
  el("langRoBtn").classList.toggle("is-active", state.language === "ro");
  el("langEnBtn").classList.toggle("is-active", state.language === "en");

  const settings = el("profileScreen").querySelectorAll(".settings-item span");
  if (settings[0]) settings[0].textContent = t("account");
  if (settings[1]) settings[1].textContent = t("notifications");
  if (settings[2]) settings[2].textContent = t("privacy");

  const titleNodes = el("profileScreen").querySelectorAll(".section-title");
  if (titleNodes[0]) titleNodes[0].textContent = t("language");
}

function buildOverviewMarkup(match, analysis) {
  const oneXtwo = analysis?.marketGroups?.find((group) => group.title === "FT 1X2")?.rows || [];
  const home = oneXtwo.find((row) => row.label === "Victorie gazde");
  const draw = oneXtwo.find((row) => row.label === "Egal");
  const away = oneXtwo.find((row) => row.label === "Victorie oaspeti");
  const primary = analysis?.primary;
  const smartRows = analysis?.canonicalRows?.slice(0, 4) || [];
  const signalWidth = primary ? Math.max(14, Math.round(primary.probability * 100)) : 14;

  return `
    <article class="overview-card">
      <div class="section-kicker">AI Win Probability</div>
      <div class="probability-grid">
        <div class="probability-item"><strong>${escapeHtml(home ? pct01(home.probability) : "—")}</strong><span>${escapeHtml(displayTeamName(match.home))}</span></div>
        <div class="probability-item"><strong>${escapeHtml(draw ? pct01(draw.probability) : "—")}</strong><span>${state.language === "ro" ? "Egal" : "Draw"}</span></div>
        <div class="probability-item"><strong>${escapeHtml(away ? pct01(away.probability) : "—")}</strong><span>${escapeHtml(displayTeamName(match.away))}</span></div>
      </div>
      <div class="signal-meter"><span style="width:${signalWidth}%"></span></div>
    </article>

    <article class="overview-card">
      <div class="section-kicker">Smart Predictions</div>
      <div class="smart-picks-grid">
        ${smartRows.map((row) => `
          <div class="smart-pick-card">
            <span>${escapeHtml(row.label)}</span>
            <strong>${escapeHtml(pct01(row.probability))}</strong>
          </div>
        `).join("")}
      </div>
      <div class="action-row" style="margin-top:14px;">
        <button class="cta-button" type="button" data-ask-ai-detail>${state.language === "ro" ? "Intreaba AI" : "Ask AI"}</button>
        <button class="secondary-button" type="button" data-open-alerts-detail>${state.language === "ro" ? "Creeaza alerta" : "Create Alert"}</button>
      </div>
    </article>
  `;
}

function buildInsightMarkup(match, analysis) {
  const reasons = analysis?.reasons || [];
  return `
    <article class="detail-panel-card">
      <div class="section-kicker">AI Insight</div>
      <div class="insight-copy">${escapeHtml(buildInsightSentence(match, analysis))}</div>
    </article>
    <article class="detail-panel-card">
      <div class="section-kicker">${state.language === "ro" ? "De ce acest semnal" : "Why this signal"}</div>
      <div class="feed-list">
        ${reasons.slice(0, 4).map((reason) => `<div class="feed-excerpt" style="margin-top:0;">${escapeHtml(reason)}</div>`).join("")}
      </div>
    </article>
  `;
}

function buildStatsMarkup(analysis) {
  const rows = [
    { label: "Goals", value: analysis?.hero?.expectedGoals || 0, max: 5 },
    { label: "Corners", value: analysis?.hero?.expectedCorners || 0, max: 15 },
    { label: "Cards", value: analysis?.hero?.expectedCards || 0, max: 8 },
    { label: "BTTS", value: (analysis?.metrics?.bttsFt || 0) * 100, max: 100 }
  ];

  return `
    <article class="stats-card">
      <div class="stats-grid">
        ${rows.map((row) => `
          <div class="stat-row">
            <div class="stat-row-head">
              <span>${escapeHtml(row.label)}</span>
              <strong>${escapeHtml(row.label === "BTTS" ? `${Math.round(row.value)}%` : row.value.toFixed(2))}</strong>
            </div>
            <div class="stat-bar"><span style="width:${Math.max(8, Math.min(100, (row.value / row.max) * 100))}%"></span></div>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function buildCompareMarkup(match, analysis, historyEntry) {
  const homeStats = historyEntry?.homeStats;
  const awayStats = historyEntry?.awayStats;
  const rows = [
    { label: state.language === "ro" ? "Goluri / meci" : "Goals / match", home: homeStats?.homeGF?.toFixed(2) ?? "—", away: awayStats?.awayGF?.toFixed(2) ?? "—" },
    { label: state.language === "ro" ? "Goluri primite" : "Goals conceded", home: homeStats?.homeGA?.toFixed(2) ?? "—", away: awayStats?.awayGA?.toFixed(2) ?? "—" },
    { label: state.language === "ro" ? "Cornere / meci" : "Corners / match", home: homeStats?.homeCornersFor?.toFixed(1) ?? "—", away: awayStats?.awayCornersFor?.toFixed(1) ?? "—" },
    { label: state.language === "ro" ? "Cartonase / meci" : "Cards / match", home: homeStats?.homeYCFor?.toFixed(1) ?? "—", away: awayStats?.awayYCFor?.toFixed(1) ?? "—" }
  ];

  return `
    <article class="compare-card">
      <div class="compare-header">
        <div class="score-team">
          ${badgeMarkup(match.home)}
          <span>${escapeHtml(displayTeamName(match.home))}</span>
        </div>
        <div class="section-chip">VS</div>
        <div class="score-team">
          ${badgeMarkup(match.away)}
          <span>${escapeHtml(displayTeamName(match.away))}</span>
        </div>
      </div>
      <div class="compare-table" style="margin-top:16px;">
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
  const analysis = getAnalysis(match);
  const historyEntry = getHistEntry(match.fixtureId);

  el("detailLeagueLabel").textContent = match.tournamentName;
  el("detailKickoffLabel").textContent = fmtTime(match.startTime);
  el("detailPseudoScore").textContent = buildPseudoScore(analysis);
  setBadgeVisual("detailHomeBadge", match.home);
  setBadgeVisual("detailAwayBadge", match.away);
  el("detailHomeName").textContent = displayTeamName(match.home);
  el("detailAwayName").textContent = displayTeamName(match.away);

  document.querySelectorAll("[data-detail-tab]").forEach((button) => {
    const tab = button.getAttribute("data-detail-tab");
    button.classList.toggle("is-active", tab === state.detailTab);
    if (tab === "overview") button.textContent = t("detailOverview");
    if (tab === "insight") button.textContent = t("detailInsight");
    if (tab === "stats") button.textContent = t("detailStats");
    if (tab === "compare") button.textContent = t("detailCompare");
  });

  el("detailOverviewTab").hidden = state.detailTab !== "overview";
  el("detailInsightTab").hidden = state.detailTab !== "insight";
  el("detailStatsTab").hidden = state.detailTab !== "stats";
  el("detailCompareTab").hidden = state.detailTab !== "compare";

  el("detailOverviewTab").innerHTML = analysis ? buildOverviewMarkup(match, analysis) : "";
  el("detailInsightTab").innerHTML = analysis ? buildInsightMarkup(match, analysis) : "";
  el("detailStatsTab").innerHTML = analysis ? buildStatsMarkup(analysis) : "";
  el("detailCompareTab").innerHTML = analysis ? buildCompareMarkup(match, analysis, historyEntry) : "";

  el("detailOverviewTab").querySelectorAll("[data-ask-ai-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeScreen = "ai";
      state.aiMessage = buildInsightSentence(match, analysis);
      renderAll();
    });
  });
  el("detailOverviewTab").querySelectorAll("[data-open-alerts-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeScreen = "alerts";
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
      <div class="backtest-copy">${escapeHtml(state.language === "ro" ? "Meciurile in care modelul nu a fortat o selectie." : "Matches where KYRO preferred not to force a pick.")}</div>
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
    ai: "navAiBtn",
    alerts: "navAlertsBtn",
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
  el("alertsScreen").hidden = state.activeScreen !== "alerts";
  el("profileScreen").hidden = state.activeScreen !== "profile";
  el("detailScreen").hidden = state.activeScreen !== "detail";
  el("backFromDetailBtn").hidden = state.activeScreen !== "detail";
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
  renderAlerts();
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
  el("navAiBtn").addEventListener("click", () => { state.activeScreen = "ai"; renderAll(); });
  el("navAlertsBtn").addEventListener("click", () => { state.activeScreen = "alerts"; renderAll(); });
  el("navProfileBtn").addEventListener("click", () => { state.activeScreen = "profile"; renderAll(); });
  el("backFromDetailBtn").addEventListener("click", () => { state.activeScreen = "matches"; renderAll(); });
  el("openMatchesFromHomeBtn").addEventListener("click", () => { state.activeScreen = "matches"; renderAll(); });
  el("openFeaturedDetailBtn").addEventListener("click", () => { state.activeScreen = "detail"; renderAll(); });
  el("openAiFromHeroBtn").addEventListener("click", () => {
    const featured = getFeaturedMatch();
    const analysis = getAnalysis(featured);
    state.aiMessage = buildInsightSentence(featured, analysis);
    state.activeScreen = "ai";
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

  el("useFeaturedPromptBtn").addEventListener("click", () => {
    const featured = getFeaturedMatch();
    const analysis = getAnalysis(featured);
    state.aiMessage = buildInsightSentence(featured, analysis);
    renderAiScreen();
  });

  el("modelInfoBtn").addEventListener("click", () => { el("modelSummaryModal").hidden = false; });
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
