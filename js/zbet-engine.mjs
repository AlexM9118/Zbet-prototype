import { oddsFromProb } from "./utils.mjs";
import { estGoals, estCorners, estCards, probBTTS, prob1X2, probTotalOver } from "./models.mjs";

const HT_SHARE = 0.46;
const SCORE_MAX = 6;
const GOAL_LINES_FT = [1.5, 2.5, 3.5, 4.5];
const GOAL_LINES_HT = [0.5, 1.5, 2.5];
const CORNER_LINES = [8.5, 9.5, 10.5];
const CARD_LINES = [3.5, 4.5, 5.5];
const GOALS_RANGE_BUCKETS = [
  { label: "0 goluri", test: (total) => total === 0 },
  { label: "1-2 goluri", test: (total) => total >= 1 && total <= 2 },
  { label: "1-3 goluri", test: (total) => total >= 1 && total <= 3 },
  { label: "2-3 goluri", test: (total) => total >= 2 && total <= 3 },
  { label: "2-4 goluri", test: (total) => total >= 2 && total <= 4 },
  { label: "4+ goluri", test: (total) => total >= 4 }
];

function factorial(value) {
  let result = 1;
  for (let index = 2; index <= value; index += 1) result *= index;
  return result;
}

function poissonPMF(goals, lambda) {
  return Math.exp(-lambda) * Math.pow(lambda, goals) / factorial(goals);
}

function buildScoreMatrix(homeLambda, awayLambda, maxGoals = SCORE_MAX) {
  const matrix = [];
  for (let homeGoals = 0; homeGoals <= maxGoals; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= maxGoals; awayGoals += 1) {
      matrix.push({
        homeGoals,
        awayGoals,
        probability: poissonPMF(homeGoals, homeLambda) * poissonPMF(awayGoals, awayLambda)
      });
    }
  }
  return matrix;
}

function sumProbabilities(matrix, predicate) {
  return matrix.reduce((total, cell) => total + (predicate(cell) ? cell.probability : 0), 0);
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function recentStrengthScore(teamStats) {
  if (!teamStats) return 0;
  const attack = ((teamStats.homeGF || 0) + (teamStats.awayGF || 0)) * 14;
  const defense = Math.max(0, 3.4 - (((teamStats.homeGA || 0) + (teamStats.awayGA || 0)) / 2)) * 16;
  const corners = (((teamStats.homeCornersFor || 0) + (teamStats.awayCornersFor || 0)) / 2) * 1.1;
  const discipline = Math.max(0, 4.8 - (((teamStats.homeYCFor || 0) + (teamStats.awayYCFor || 0)) / 2)) * 0.8;
  return attack + defense + corners + discipline;
}

function buildPowerRanking(leagueStats, selectedTeams = []) {
  if (!leagueStats?.teamStats) return [];
  const selectedSet = new Set(selectedTeams.map((team) => normalizeName(team)).filter(Boolean));
  return Object.entries(leagueStats.teamStats)
    .map(([team, stats]) => ({
      team,
      score: recentStrengthScore(stats),
      gf: (((stats.homeGF || 0) + (stats.awayGF || 0)) / 2),
      ga: (((stats.homeGA || 0) + (stats.awayGA || 0)) / 2),
      corners: (((stats.homeCornersFor || 0) + (stats.awayCornersFor || 0)) / 2),
      cards: (((stats.homeYCFor || 0) + (stats.awayYCFor || 0)) / 2),
      isSelected: selectedSet.has(normalizeName(team))
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);
}

function getSelectionPrice(match, market, selection) {
  const entry = match?.selectionIndex?.[`${market}|${selection}`];
  const price = Number(entry?.price);
  return Number.isFinite(price) && price > 1 ? price : null;
}

function resolveDisplayOdds(bookOdds, fairOdds) {
  if (Number.isFinite(bookOdds) && bookOdds > 1) return { value: bookOdds, type: "book" };
  if (Number.isFinite(fairOdds) && fairOdds > 1) return { value: fairOdds, type: "model" };
  return { value: null, type: "none" };
}

function bookmakerLabel(oddsType) {
  return oddsType === "book" ? "Cota disponibila" : "Cota model";
}

function verdictForRow(family, probability, displayOdds, label) {
  if (!Number.isFinite(probability)) return "watch";
  if (family === "score") return probability >= 0.12 ? "bet" : probability >= 0.08 ? "watch" : "avoid";
  if (family === "range") return probability >= 0.56 ? "bet" : probability >= 0.46 ? "watch" : "avoid";
  if (label.includes("Ambele marcheaza - Nu")) return probability >= 0.7 ? "watch" : "avoid";
  if (label.includes("Sub 4.5 goluri")) return probability >= 0.78 ? "watch" : "avoid";
  if (family === "corners" || family === "cards") return probability >= 0.61 ? "bet" : probability >= 0.54 ? "watch" : "avoid";
  if (displayOdds >= 1.2 && displayOdds <= 1.55 && probability >= 0.64) return "bet";
  if (probability >= 0.59) return "watch";
  return "avoid";
}

function confidenceForRow(probability, displayOdds) {
  if (!Number.isFinite(probability)) return 0;
  let score = probability;
  if (displayOdds >= 1.2 && displayOdds <= 1.55) score += 0.03;
  if (displayOdds > 1.7) score -= 0.04;
  return Math.max(0, Math.min(0.95, score));
}

function buildRow({
  label,
  shortLabel = label,
  family,
  period,
  market,
  selection,
  probability,
  fairOdds,
  bookOdds,
  note = ""
}) {
  const resolvedOdds = resolveDisplayOdds(bookOdds, fairOdds);
  const displayOdds = resolvedOdds.value;
  const verdict = verdictForRow(family, probability, displayOdds, label);
  return {
    label,
    shortLabel,
    family,
    period,
    market,
    selection,
    probability,
    fairOdds,
    bookOdds,
    displayOdds,
    oddsType: resolvedOdds.type,
    oddsLabel: bookmakerLabel(resolvedOdds.type),
    verdict,
    confidence: confidenceForRow(probability, displayOdds || fairOdds || 0),
    note
  };
}

function buildOutcomeRows(period, probabilities, match, market) {
  if (!probabilities) return [];
  const labels = {
    HOME: "Victorie gazde",
    DRAW: "Egal",
    AWAY: "Victorie oaspeti",
    "1X": "1X",
    "12": "12",
    "X2": "X2",
    YES: "Ambele marcheaza",
    NO: "Ambele marcheaza - Nu"
  };
  return Object.entries(probabilities).map(([selection, probability]) => buildRow({
    label: labels[selection] || selection,
    shortLabel: labels[selection] || selection,
    family: market === "BTTS" ? "btts" : market === "Double Chance" ? "doubleChance" : "oneXtwo",
    period,
    market,
    selection,
    probability,
    fairOdds: oddsFromProb(probability),
    bookOdds: period === "FT" ? getSelectionPrice(match, market, selection) : null
  }));
}

function buildTotalsRows(period, family, marketPrefix, lines, lambdaTotal, match) {
  return lines.map((line) => {
    const probabilityOver = probTotalOver(line, lambdaTotal);
    const probabilityUnder = 1 - probabilityOver;
    const selection = probabilityOver >= probabilityUnder ? "OVER" : "UNDER";
    const probability = Math.max(probabilityOver, probabilityUnder);
    const side = selection === "OVER" ? "Peste" : "Sub";
    const market = `${marketPrefix} ${line}`;
    return buildRow({
      label: `${side} ${line} ${family === "corners" ? "cornere" : family === "cards" ? "cartonase" : "goluri"}`,
      shortLabel: `${side} ${line}`,
      family,
      period,
      market,
      selection,
      probability,
      fairOdds: oddsFromProb(probability),
      bookOdds: getSelectionPrice(match, market, selection)
    });
  });
}

function buildGoalsRangeRows(matrix, period) {
  return GOALS_RANGE_BUCKETS.map((bucket) => {
    const probability = sumProbabilities(matrix, (cell) => bucket.test(cell.homeGoals + cell.awayGoals));
    return buildRow({
      label: bucket.label,
      shortLabel: bucket.label,
      family: "range",
      period,
      market: `Range ${bucket.label}`,
      selection: bucket.label,
      probability,
      fairOdds: oddsFromProb(probability),
      bookOdds: null
    });
  });
}

function buildCorrectScoreRows(matrix, period) {
  return [...matrix]
    .sort((left, right) => right.probability - left.probability)
    .slice(0, 3)
    .map((cell) => buildRow({
      label: `${cell.homeGoals}-${cell.awayGoals}`,
      shortLabel: `${cell.homeGoals}-${cell.awayGoals}`,
      family: "score",
      period,
      market: `${period} Correct Score`,
      selection: `${cell.homeGoals}-${cell.awayGoals}`,
      probability: cell.probability,
      fairOdds: oddsFromProb(cell.probability),
      bookOdds: null
    }));
}

function pickCanonicalRows(groupMap) {
  const wanted = [
    ["FT Double Chance", "1X"],
    ["FT Double Chance", "X2"],
    ["FT 1X2", "Victorie gazde"],
    ["FT 1X2", "Victorie oaspeti"],
    ["HT Totals", "Peste 0.5"],
    ["HT Totals", "Sub 1.5"],
    ["HT BTTS", "Ambele marcheaza"],
    ["FT BTTS", "Ambele marcheaza"],
    ["FT Totals", "Peste 1.5"],
    ["FT Totals", "Peste 2.5"],
    ["FT Totals", "Sub 2.5"],
    ["FT Totals", "Sub 3.5"],
    ["Corners", "Peste 8.5"],
    ["Cards", "Peste 3.5"]
  ];

  return wanted
    .map(([groupTitle, startsWith]) => {
      const rows = groupMap.get(groupTitle) || [];
      return rows.find((row) => row.label.startsWith(startsWith)) || null;
    })
    .filter(Boolean)
    .map((row) => ({
      ...row,
      verdict: row.verdict === "watch" && row.probability >= 0.64 ? "bet" : row.verdict
    }));
}

function scoreRecommendation(row) {
  if (!row) return -999;
  let score = row.probability * 3.1;
  if (row.displayOdds >= 1.22 && row.displayOdds <= 1.55) score += 0.45;
  if (row.displayOdds > 1.7) score -= 0.35;
  if (row.family === "doubleChance") score += 0.28;
  if (row.label === "12") score -= 0.55;
  if (row.family === "oneXtwo" && row.label === "Victorie gazde") score += 0.26;
  if (row.family === "corners" || row.family === "cards") score += 0.22;
  if ((row.family === "corners" || row.family === "cards") && row.label.startsWith("Peste")) score += 0.18;
  if ((row.family === "corners" || row.family === "cards") && row.label.startsWith("Sub")) score -= 0.22;
  if (row.family === "btts" && row.label === "Ambele marcheaza") score += 0.16;
  if (row.label === "Peste 1.5 goluri") score -= 0.22;
  if (row.label === "Sub 3.5 goluri") score -= 0.3;
  if (row.label === "Sub 4.5 goluri") score -= 0.48;
  if (row.label === "Ambele marcheaza - Nu") score -= 0.6;
  if (row.verdict === "avoid") score -= 1.5;
  return score;
}

function chooseRecommendations(groups) {
  const allRows = groups.flatMap((group) => group.rows);
  const candidates = allRows
    .filter((row) => row.verdict !== "avoid")
    .filter((row) => row.displayOdds == null || row.displayOdds >= 1.18)
    .sort((left, right) => scoreRecommendation(right) - scoreRecommendation(left));

  const primary = candidates[0] || null;
  const secondary = primary
    ? candidates.find((row) => row.family !== primary.family && row.label !== primary.label) || candidates[1] || null
    : null;
  return { primary, secondary };
}

function buildReasons(match, entry, metrics, primary, secondary) {
  const reasons = [];
  if (primary) {
    reasons.push(`Best Bet: ${primary.label} este sustinut de model la ${Math.round(primary.probability * 100)}%.`);
  }
  if (secondary) {
    reasons.push(`Plan B: ${secondary.label} aduce o familie diferita de piata, pentru mai multa varietate.`);
  }
  if (metrics.goals) {
    reasons.push(`Modelul proiecteaza ${metrics.goals.lt.toFixed(2)} goluri totale, cu ${metrics.goals.lh.toFixed(2)} pentru gazde si ${metrics.goals.la.toFixed(2)} pentru oaspeti.`);
    reasons.push(`Probabilitatea pentru Ambele marcheaza este de ${Math.round(metrics.bttsFt * 100)}%.`);
  } else {
    reasons.push("Datele recente pentru goluri sunt incomplete, deci analiza ramane mai prudenta.");
  }
  if (metrics.corners) {
    reasons.push(`Volumul estimat de cornere este de ${metrics.corners.lt.toFixed(1)}, suficient pentru a intra si pe piete secundare.`);
  }
  if (metrics.cards) {
    reasons.push(`Modelul vede aproximativ ${metrics.cards.lt.toFixed(1)} cartonase, util pentru filtrarea meciurilor mai intense.`);
  }
  if (!metrics.corners && !metrics.cards) {
    reasons.push("Pentru acest meci lipsesc semnale bune pe cornere si cartonase, asa ca prioritatea ramane pe goluri si 1X2.");
  }
  if (entry?.note) {
    reasons.push(entry.note);
  }
  return reasons.slice(0, 5);
}

export function buildMatchAnalysis(match, historyEntry, leagueStats = null) {
  if (!match || !historyEntry) {
    return {
      hero: null,
      marketGroups: [],
      canonicalRows: [],
      primary: null,
      secondary: null,
      reasons: [],
      powerRanking: [],
      metrics: {}
    };
  }

  const goals = estGoals(historyEntry);
  const goalsHt = goals ? { lh: goals.lh * HT_SHARE, la: goals.la * HT_SHARE, lt: goals.lt * HT_SHARE } : null;
  const corners = estCorners(historyEntry);
  const cards = estCards(historyEntry);

  const marketGroups = [];
  if (goals) {
    const ftMatrix = buildScoreMatrix(goals.lh, goals.la);
    const htMatrix = buildScoreMatrix(goalsHt.lh, goalsHt.la);
    const ft1x2 = prob1X2(goals.lh, goals.la);
    const ht1x2 = prob1X2(goalsHt.lh, goalsHt.la);
    const bttsFt = probBTTS(goals.lh, goals.la);
    const bttsHt = probBTTS(goalsHt.lh, goalsHt.la);

    marketGroups.push({
      key: "ft-1x2",
      title: "FT 1X2",
      rows: buildOutcomeRows("FT", { HOME: ft1x2.home, DRAW: ft1x2.draw, AWAY: ft1x2.away }, match, "1X2")
    });
    marketGroups.push({
      key: "ft-dc",
      title: "FT Double Chance",
      rows: buildOutcomeRows("FT", { "1X": ft1x2.home + ft1x2.draw, "12": ft1x2.home + ft1x2.away, "X2": ft1x2.draw + ft1x2.away }, match, "Double Chance")
    });
    marketGroups.push({
      key: "ft-btts",
      title: "FT BTTS",
      rows: buildOutcomeRows("FT", { YES: bttsFt, NO: 1 - bttsFt }, match, "BTTS")
    });
    marketGroups.push({
      key: "ft-goals",
      title: "FT Totals",
      rows: buildTotalsRows("FT", "goals", "Goals", GOAL_LINES_FT, goals.lt, match)
    });
    marketGroups.push({
      key: "ft-range",
      title: "FT Goals Range",
      rows: buildGoalsRangeRows(ftMatrix, "FT")
    });
    marketGroups.push({
      key: "ft-score",
      title: "FT Correct Score",
      rows: buildCorrectScoreRows(ftMatrix, "FT")
    });
    marketGroups.push({
      key: "ht-1x2",
      title: "HT 1X2",
      rows: buildOutcomeRows("HT", { HOME: ht1x2.home, DRAW: ht1x2.draw, AWAY: ht1x2.away }, match, "1X2")
    });
    marketGroups.push({
      key: "ht-btts",
      title: "HT BTTS",
      rows: buildOutcomeRows("HT", { YES: bttsHt, NO: 1 - bttsHt }, match, "BTTS")
    });
    marketGroups.push({
      key: "ht-goals",
      title: "HT Totals",
      rows: buildTotalsRows("HT", "goals", "HT Goals", GOAL_LINES_HT, goalsHt.lt, match)
    });
    marketGroups.push({
      key: "ht-score",
      title: "HT Correct Score",
      rows: buildCorrectScoreRows(htMatrix, "HT")
    });
  }

  if (corners) {
    marketGroups.push({
      key: "corners",
      title: "Corners",
      rows: buildTotalsRows("FT", "corners", "Corners", CORNER_LINES, corners.lt, match)
    });
  }

  if (cards) {
    marketGroups.push({
      key: "cards",
      title: "Cards",
      rows: buildTotalsRows("FT", "cards", "Cards", CARD_LINES, cards.lt, match)
    });
  }

  const groupMap = new Map(marketGroups.map((group) => [group.title, group.rows]));
  const canonicalRows = pickCanonicalRows(groupMap);
  const { primary, secondary } = chooseRecommendations(marketGroups);
  const powerRanking = buildPowerRanking(leagueStats, [match.home, match.away]);
  const metrics = {
    goals,
    goalsHt,
    corners,
    cards,
    bttsFt: goals ? probBTTS(goals.lh, goals.la) : null,
    tempo: goals ? Math.min(1, goals.lt / 3.4) : 0
  };
  const reasons = buildReasons(match, historyEntry, metrics, primary, secondary);

  const homeForm = historyEntry.homeStats;
  const awayForm = historyEntry.awayStats;
  const homePulse = recentStrengthScore(homeForm);
  const awayPulse = recentStrengthScore(awayForm);
  const pulseDelta = homePulse - awayPulse;
  const hero = {
    leagueLabel: `${match.categoryName} • ${match.tournamentName}`,
    kickoff: match.startTime,
    home: match.home,
    away: match.away,
    homePulse,
    awayPulse,
    pulseDelta,
    expectedGoals: goals?.lt || null,
    expectedCorners: corners?.lt || null,
    expectedCards: cards?.lt || null
  };

  return {
    hero,
    marketGroups,
    canonicalRows,
    primary,
    secondary,
    reasons,
    powerRanking,
    metrics
  };
}
