import {
  SAFE_THRESHOLD,
  MAX_TICKET_LEG_ODDS,
  MIN_MATCH_RECO_ODDS,
  IDEAL_MATCH_RECO_ODDS,
  GOALS_LINES,
  CORNERS_LINES,
  CARDS_LINES,
  TICKET_CONFIGS
} from "./config.mjs";
import { oddsFromProb, pctRounded, fmtOdds } from "./utils.mjs";
import { estGoals, estCorners, estCards, probBTTS, prob1X2, probTotalOver } from "./models.mjs";

function buildSelectionKeyFromPick(pick) {
  return `${String(pick.market)}|${String(pick.sel)}`;
}

function getBookSelection(match, market, sel) {
  if (!match?.selectionIndex) return null;
  return match.selectionIndex[buildSelectionKeyFromPick({ market, sel })] || null;
}

function getNormalizedMarketProbability(match, market, sel) {
  const selection = getBookSelection(match, market, sel);
  if (!selection?.price) return null;

  let outcomes = [];
  if (market === "1X2") {
    outcomes = match?.featuredMarkets?.ft1x2?.outcomes || [];
  } else if (market === "Double Chance") {
    outcomes = [
      getBookSelection(match, "Double Chance", "1X") ? { key: "1X", price: getBookSelection(match, "Double Chance", "1X")?.price } : null,
      getBookSelection(match, "Double Chance", "12") ? { key: "12", price: getBookSelection(match, "Double Chance", "12")?.price } : null,
      getBookSelection(match, "Double Chance", "X2") ? { key: "X2", price: getBookSelection(match, "Double Chance", "X2")?.price } : null
    ].filter(Boolean);
  } else if (market === "BTTS") {
    outcomes = match?.featuredMarkets?.btts?.outcomes || [];
  } else {
    const over = getBookSelection(match, market, "OVER");
    const under = getBookSelection(match, market, "UNDER");
    outcomes = [
      over ? { key: "OVER", price: over.price } : null,
      under ? { key: "UNDER", price: under.price } : null
    ].filter(Boolean);
  }

  const normalized = normalizedProbabilities(outcomes);
  return normalized.find((outcome) => String(outcome.key) === String(sel))?.probability ?? null;
}

export function pickDisplayLabel(pick) {
  if (pick.market === "1X2") {
    return { HOME: "Victorie gazde", DRAW: "Egal", AWAY: "Victorie oaspeti" }[pick.sel] || "1X2";
  }
  if (pick.market === "Double Chance") {
    return { "1X": "1X", "12": "12", "X2": "X2" }[pick.sel] || "Double Chance";
  }
  if (pick.market === "BTTS") {
    return pick.sel === "YES" ? "Ambele marcheaza" : "Ambele marcheaza - Nu";
  }

  const goalsMatch = String(pick.market).match(/^Goals (\d+(?:\.\d+)?)$/);
  if (goalsMatch) return `${pick.sel === "OVER" ? "Peste" : "Sub"} ${goalsMatch[1]} goluri`;

  const cornersMatch = String(pick.market).match(/^Corners (\d+(?:\.\d+)?)$/);
  if (cornersMatch) return `${pick.sel === "OVER" ? "Peste" : "Sub"} ${cornersMatch[1]} cornere`;

  const cardsMatch = String(pick.market).match(/^Cards (\d+(?:\.\d+)?)$/);
  if (cardsMatch) return `${pick.sel === "OVER" ? "Peste" : "Sub"} ${cardsMatch[1]} cartonase`;

  return `${pick.market} ${pick.sel}`;
}

function pickReasonText(pick) {
  if (pick.market === "1X2") {
    return {
      HOME: "Modelul de goluri favorizeaza echipa gazda.",
      DRAW: "Distributia de scor sugereaza un meci echilibrat.",
      AWAY: "Modelul ofera avantaj echipei oaspete."
    }[pick.sel] || "Selectie generata de modelul SAFE.";
  }
  if (pick.market === "Double Chance") {
    return {
      "1X": "Modelul vede gazdele suficient de solide pentru a evita infrangerea.",
      "12": "Modelul vede un meci putin probabil sa se incheie egal.",
      "X2": "Modelul vede oaspetii suficient de solizi pentru a evita infrangerea."
    }[pick.sel] || "Selectie generata de modelul SAFE.";
  }
  if (pick.market === "BTTS") {
    return pick.sel === "YES"
      ? "Profil ofensiv compatibil pentru ambele echipe."
      : "Modelul vede sanse bune sa nu marcheze ambele.";
  }

  const market = String(pick.market);
  if (market.startsWith("Goals ")) {
    return pick.sel === "OVER"
      ? "Linia de goluri este sustinuta de ritmul ofensiv estimat."
      : "Modelul vede un total mai controlat de goluri.";
  }
  if (market.startsWith("Corners ")) {
    return pick.sel === "OVER"
      ? "Volumul de cornere proiectat depaseste linia bookmakerului."
      : "Ritmul de joc sugereaza mai putine cornere decat linia afisata.";
  }
  if (market.startsWith("Cards ")) {
    return pick.sel === "OVER"
      ? "Intensitatea estimata a jocului favorizeaza mai multe cartonase."
      : "Modelul anticipeaza un meci mai disciplinat.";
  }
  return "Selectie generata de modelul SAFE.";
}

function buildCandidate(match, market, sel, probability) {
  const bookSelection = getBookSelection(match, market, sel);
  const bookOdds = Number(bookSelection?.price);
  if (!Number.isFinite(bookOdds) || bookOdds <= 1) return null;
  const marketProbability = getNormalizedMarketProbability(match, market, sel);
  return {
    fixtureId: String(match.fixtureId),
    match: `${match.home} vs ${match.away}`,
    home: match.home,
    away: match.away,
    market,
    sel,
    p: Number(probability),
    marketProbability: Number.isFinite(marketProbability) ? Number(marketProbability) : null,
    bookOdds,
    fairOdds: oddsFromProb(probability),
    edge: Number(probability) - (1 / bookOdds),
    startTime: match.startTime,
    tournamentName: match.tournamentName || "",
    categoryName: match.categoryName || "",
    displayLabel: pickDisplayLabel({ market, sel }),
    reason: pickReasonText({ market, sel }),
    source: "history"
  };
}

function buildFallbackCandidate(match, market, sel, probability, reason) {
  const bookSelection = getBookSelection(match, market, sel);
  const bookOdds = Number(bookSelection?.price);
  if (!Number.isFinite(bookOdds) || bookOdds <= 1) return null;
  const marketProbability = getNormalizedMarketProbability(match, market, sel);
  return {
    fixtureId: String(match.fixtureId),
    match: `${match.home} vs ${match.away}`,
    home: match.home,
    away: match.away,
    market,
    sel,
    p: Number(probability),
    marketProbability: Number.isFinite(marketProbability) ? Number(marketProbability) : null,
    bookOdds,
    fairOdds: oddsFromProb(probability),
    edge: 0,
    startTime: match.startTime,
    tournamentName: match.tournamentName || "",
    categoryName: match.categoryName || "",
    displayLabel: pickDisplayLabel({ market, sel }),
    reason,
    source: "odds"
  };
}

function normalizedProbabilities(outcomes) {
  const priced = (outcomes || [])
    .map((outcome) => ({ ...outcome, implied: 1 / Number(outcome.price) }))
    .filter((outcome) => Number.isFinite(outcome.implied) && outcome.implied > 0);
  const sum = priced.reduce((acc, outcome) => acc + outcome.implied, 0);
  if (!sum) return [];
  return priced.map((outcome) => ({ ...outcome, probability: outcome.implied / sum }));
}

function getMarketProfile(candidate) {
  if (candidate.market === "1X2") {
    return {
      category: "1X2",
      minProb: 0.61,
      minOdds: 1.28,
      idealOdds: 1.42,
      probWeight: 2.9,
      edgeWeight: 1.7,
      lowOddsPenalty: 5.2,
      highOddsPenalty: 1.6,
      weakProbPenalty: 3.2,
      baseBonus: -0.08
    };
  }
  if (candidate.market === "Double Chance") {
    return {
      category: "DOUBLE_CHANCE",
      minProb: 0.68,
      minOdds: 1.25,
      idealOdds: 1.36,
      probWeight: 2.95,
      edgeWeight: 1.45,
      lowOddsPenalty: 4.8,
      highOddsPenalty: 1.1,
      weakProbPenalty: 2.4,
      baseBonus: 0.06
    };
  }
  if (candidate.market === "BTTS" || String(candidate.market).startsWith("Goals ")) {
    return {
      category: "GOALS",
      minProb: 0.58,
      minOdds: 1.24,
      idealOdds: 1.34,
      probWeight: 2.7,
      edgeWeight: 2.2,
      lowOddsPenalty: 4.4,
      highOddsPenalty: 1.2,
      weakProbPenalty: 2.4,
      baseBonus: 0.1
    };
  }
  if (String(candidate.market).startsWith("Corners ")) {
    return {
      category: "CORNERS",
      minProb: 0.57,
      minOdds: 1.28,
      idealOdds: 1.4,
      probWeight: 2.35,
      edgeWeight: 2.65,
      lowOddsPenalty: 3.8,
      highOddsPenalty: 1.15,
      weakProbPenalty: 2.1,
      baseBonus: 0.05
    };
  }
  return {
    category: "CARDS",
    minProb: 0.56,
    minOdds: 1.3,
    idealOdds: 1.42,
    probWeight: 2.25,
    edgeWeight: 2.7,
    lowOddsPenalty: 3.6,
    highOddsPenalty: 1.05,
    weakProbPenalty: 1.95,
    baseBonus: 0.04
  };
}

function scoreMarketFit(candidate) {
  let score = candidate.source === "history" ? 0.18 : -0.02;

  if (candidate.market === "1X2") {
    if (candidate.sel === "DRAW") score -= 0.12;
    if (candidate.sel !== "DRAW" && candidate.p >= 0.64 && candidate.bookOdds >= 1.25 && candidate.bookOdds <= 1.58) score += 0.28;
    if (candidate.p >= 0.68 && candidate.bookOdds >= 1.28 && candidate.bookOdds <= 1.62) score += 0.22;
    if (candidate.bookOdds < 1.24) score -= 0.18;
    return score;
  }

  if (candidate.market === "Double Chance") {
    if ((candidate.sel === "1X" || candidate.sel === "X2") && candidate.bookOdds >= 1.25 && candidate.bookOdds <= 1.48) score += 0.28;
    if (candidate.sel === "12") score -= 0.18;
    if (candidate.bookOdds < 1.24) score -= 0.22;
    if (candidate.p >= 0.74 && candidate.edge >= 0.01) score += 0.12;
    return score;
  }

  if (candidate.market === "BTTS") {
    if (candidate.bookOdds >= 1.24 && candidate.bookOdds <= 1.48) score += 0.22;
    if (candidate.bookOdds > 1.48 && candidate.bookOdds <= 1.72 && candidate.p >= 0.58) score += 0.18;
    if (candidate.p >= 0.6 && candidate.edge >= 0.02) score += 0.12;
    if (candidate.sel === "NO" && candidate.bookOdds < 1.22) score -= 0.1;
    return score;
  }

  const goalsMatch = String(candidate.market).match(/^Goals (\d+(?:\.\d+)?)$/);
  if (goalsMatch) {
    const line = Number(goalsMatch[1]);
    if (candidate.sel === "OVER" && line >= 2.5 && line <= 3.5) score += 0.22;
    if (candidate.sel === "UNDER" && line === 2.5 && candidate.bookOdds >= 1.34 && candidate.bookOdds <= 1.56) score += 0.14;
    if (candidate.sel === "UNDER" && line >= 2.5 && line <= 3.5) score += 0.06;
    if (candidate.sel === "UNDER" && line >= 4.5) score -= 0.5;
    if (candidate.sel === "UNDER" && line >= 4.5 && candidate.bookOdds < 1.34) score -= 0.18;
    if (candidate.sel === "UNDER" && line === 3.5 && candidate.bookOdds < 1.30) score -= 0.34;
    if (candidate.sel === "UNDER" && line === 3.5 && candidate.bookOdds >= 1.30 && candidate.bookOdds < 1.38) score -= 0.22;
    if (candidate.sel === "UNDER" && line === 3.5 && candidate.bookOdds >= 1.38 && candidate.bookOdds <= 1.48) score -= 0.1;
    if (candidate.sel === "UNDER" && line === 3.5) score -= 0.18;
    if (candidate.sel === "OVER" && line <= 1.5 && candidate.bookOdds < 1.26) score -= 0.34;
    if (candidate.sel === "OVER" && line <= 1.5 && candidate.bookOdds >= 1.26 && candidate.bookOdds < 1.32) score -= 0.16;
    if (candidate.sel === "OVER" && line <= 1.5 && candidate.bookOdds >= 1.32 && candidate.bookOdds <= 1.42) score -= 0.08;
    if (candidate.sel === "OVER" && line <= 1.5) score -= 0.14;
    if (candidate.sel === "OVER" && line === 2.5 && candidate.bookOdds >= 1.28 && candidate.bookOdds <= 1.56) score += 0.12;
    if (candidate.sel === "UNDER" && line === 2.5 && candidate.bookOdds >= 1.34 && candidate.bookOdds <= 1.52) score += 0.08;
    return score;
  }

  const cornersMatch = String(candidate.market).match(/^Corners (\d+(?:\.\d+)?)$/);
  if (cornersMatch) {
    const line = Number(cornersMatch[1]);
    if (line >= 8.5 && line <= 10.5 && candidate.bookOdds >= 1.26) score += 0.16;
    if (candidate.p >= 0.63 && candidate.edge >= 0.02) score += 0.16;
    if (candidate.bookOdds < 1.23) score -= 0.12;
    return score;
  }

  const cardsMatch = String(candidate.market).match(/^Cards (\d+(?:\.\d+)?)$/);
  if (cardsMatch) {
    const line = Number(cardsMatch[1]);
    if (line >= 3.5 && line <= 5.5 && candidate.bookOdds >= 1.28) score += 0.18;
    if (candidate.p >= 0.62 && candidate.edge >= 0.02) score += 0.18;
    if (candidate.bookOdds < 1.24) score -= 0.12;
    return score;
  }

  return score;
}

function marketFamily(candidate) {
  if (!candidate) return "OTHER";
  if (candidate.market === "1X2") return "1X2";
  if (candidate.market === "Double Chance") return "DOUBLE_CHANCE";
  if (candidate.market === "BTTS") return "Ambele marcheaza";
  if (String(candidate.market).startsWith("Goals ")) return "GOALS";
  if (String(candidate.market).startsWith("Corners ")) return "CORNERS";
  if (String(candidate.market).startsWith("Cards ")) return "CARDS";
  return "OTHER";
}

function candidateScore(candidate) {
  const profile = getMarketProfile(candidate);
  const probabilityBoost = candidate.p * profile.probWeight;
  const edgeBoost = Math.max(0, candidate.edge) * profile.edgeWeight * 10;
  const oddsDistancePenalty = Math.abs(candidate.bookOdds - profile.idealOdds) * 1.05;
  const lowOddsPenalty = candidate.bookOdds < profile.minOdds ? (profile.minOdds - candidate.bookOdds) * profile.lowOddsPenalty : 0;
  const highOddsPenalty = candidate.bookOdds > 1.55 ? (candidate.bookOdds - 1.55) * profile.highOddsPenalty : 0;
  const weakProbPenalty = candidate.p < profile.minProb ? (profile.minProb - candidate.p) * profile.weakProbPenalty * 4 : 0;
  const genericLowOddsPenalty = candidate.bookOdds < MIN_MATCH_RECO_ODDS ? (MIN_MATCH_RECO_ODDS - candidate.bookOdds) * 1.8 : 0;
  const genericOddsDistance = Math.abs(candidate.bookOdds - IDEAL_MATCH_RECO_ODDS) * 0.35;
  const marketFit = scoreMarketFit(candidate);
  const agreementGap = Number.isFinite(candidate.marketProbability) ? Math.abs(candidate.p - candidate.marketProbability) : 0.08;
  const agreementBonus = Number.isFinite(candidate.marketProbability)
    ? Math.max(0, 0.12 - agreementGap) * 1.6
    : 0;
  return profile.baseBonus + marketFit + agreementBonus + probabilityBoost + edgeBoost - oddsDistancePenalty - lowOddsPenalty - highOddsPenalty - weakProbPenalty - genericLowOddsPenalty - genericOddsDistance;
}

function candidateLineLabel(candidate) {
  if (candidate.market === "BTTS" || candidate.market === "1X2" || candidate.market === "Double Chance") return `${candidate.market}|${candidate.sel}`;
  return `${candidate.market}|${candidate.sel}`;
}

function chooseDisplayedRecommendation(scored) {
  const ordered = (scored || []).filter(Boolean);
  const best = ordered[0]?.candidate || null;
  if (!best) return null;

  const familyOfBest = marketFamily(best);
  const lineOfBest = candidateLineLabel(best);
  const goalsLine = String(best.market).match(/^Goals (\d+(?:\.\d+)?)$/)?.[1];

  const familyAlt = ordered.find(({ candidate, score }) => (
    candidate &&
    marketFamily(candidate) !== familyOfBest &&
    candidate.bookOdds >= 1.26 &&
    score >= ordered[0].score - 0.22
  ))?.candidate || null;

  if (familyAlt && familyOfBest === "GOALS" && ["1.5", "3.5", "4.5"].includes(String(goalsLine))) {
    return familyAlt;
  }

  const balancedGoalsAlt = ordered.find(({ candidate, score }) => (
    candidate &&
    marketFamily(candidate) === "GOALS" &&
    candidate.market === "Goals 2.5" &&
    candidate.bookOdds >= 1.28 &&
    score >= ordered[0].score - 0.18
  ))?.candidate || null;

  if (balancedGoalsAlt && familyOfBest === "GOALS" && ["1.5", "3.5", "4.5"].includes(String(goalsLine))) {
    return balancedGoalsAlt;
  }

  const lineAlt = ordered.find(({ candidate, score }) => (
    candidate &&
    candidateLineLabel(candidate) !== lineOfBest &&
    candidate.bookOdds >= 1.28 &&
    score >= ordered[0].score - 0.16
  ))?.candidate || null;

  if (
    lineAlt &&
    familyOfBest === "GOALS" &&
    (best.market === "Goals 1.5" || best.market === "Goals 3.5" || best.market === "Goals 4.5")
  ) {
    return lineAlt;
  }

  return best;
}

function isSameRecommendation(a, b) {
  if (!a || !b) return false;
  return `${a.market}|${a.sel}` === `${b.market}|${b.sel}`;
}

function pickSecondaryRecommendation(scored, primary) {
  if (!primary || !scored?.length) return null;
  const primaryFamily = marketFamily(primary);
  const primaryLine = candidateLineLabel(primary);
  const primaryScore = scored.find(({ candidate }) => isSameRecommendation(candidate, primary))?.score ?? scored[0]?.score ?? 0;
  const prefersSideMarkets = primaryFamily === "GOALS" || primaryFamily === "BTTS";

  const isPlanBEligible = (candidate, score, mode = "default") => {
    if (!candidate || isSameRecommendation(candidate, primary)) return false;

    const probabilityGap = candidate.p - primary.p;
    const oddsGap = candidate.bookOdds - primary.bookOdds;

    if (score > primaryScore + 0.02) return false;
    if (probabilityGap > 0.035) return false;

    if (mode !== "safe") {
      if (probabilityGap > 0.012 && oddsGap < -0.02) return false;
      if (candidate.bookOdds < primary.bookOdds - 0.08) return false;
    } else {
      if (candidate.bookOdds < primary.bookOdds - 0.12) return false;
    }

    return true;
  };

  const sideMarketAlt = prefersSideMarkets ? scored.find(({ candidate, score }) => (
    isPlanBEligible(candidate, score) &&
    ["CORNERS", "CARDS"].includes(marketFamily(candidate)) &&
    candidate.bookOdds >= 1.24 &&
    score >= scored[0].score - 0.34
  ))?.candidate || null : null;

  if (sideMarketAlt) return sideMarketAlt;

  const bttsAlt = primaryFamily === "GOALS" ? scored.find(({ candidate, score }) => (
    isPlanBEligible(candidate, score) &&
    marketFamily(candidate) === "BTTS" &&
    candidate.bookOdds >= 1.24 &&
    score >= scored[0].score - 0.3
  ))?.candidate || null : null;

  if (bttsAlt) return bttsAlt;

  const oneXTwoAlt = primaryFamily === "GOALS" || primaryFamily === "BTTS" ? scored.find(({ candidate, score }) => (
    isPlanBEligible(candidate, score) &&
    ["1X2", "DOUBLE_CHANCE"].includes(marketFamily(candidate)) &&
    candidate.bookOdds >= 1.26 &&
    score >= scored[0].score - 0.26
  ))?.candidate || null : null;

  if (oneXTwoAlt) return oneXTwoAlt;

  const strongFamilyAlt = scored.find(({ candidate, score }) => (
    isPlanBEligible(candidate, score) &&
    marketFamily(candidate) !== primaryFamily &&
    candidate.bookOdds >= 1.24 &&
    score >= scored[0].score - 0.28
  ))?.candidate || null;

  if (strongFamilyAlt) return strongFamilyAlt;

  const strongLineAlt = scored.find(({ candidate, score }) => (
    isPlanBEligible(candidate, score, "safe") &&
    candidateLineLabel(candidate) !== primaryLine &&
    candidate.bookOdds >= 1.24 &&
    score >= scored[0].score - 0.2
  ))?.candidate || null;

  if (strongLineAlt) return strongLineAlt;

  return scored.find(({ candidate, score }) => isPlanBEligible(candidate, score, "safe"))?.candidate || null;
}

export function getRecommendationConfidence(candidate) {
  if (!candidate) return { label: "Redusa", tone: "muted" };
  if (candidate.source === "odds") {
    if (candidate.p >= 0.66 && candidate.bookOdds >= 1.24 && candidate.bookOdds <= 1.42) {
      return { label: "Buna", tone: "medium" };
    }
    return { label: "Moderata", tone: "low" };
  }
  const strongOdds = candidate.bookOdds >= 1.24 && candidate.bookOdds <= 1.48;
  if (candidate.p >= 0.72 && strongOdds && candidate.edge >= 0.04) {
    return { label: "Ridicata", tone: "high" };
  }
  if (candidate.p >= 0.64 && candidate.edge >= 0.02) {
    return { label: "Buna", tone: "medium" };
  }
  return { label: "Moderata", tone: "low" };
}

export function getCandidatesForMatch(match, getHistEntry, minProbability = 0.58) {
  const entry = getHistEntry(match.fixtureId);
  const candidates = [];
  if (!entry) return candidates;

  const goals = estGoals(entry);
  if (goals) {
    const oneXTwo = prob1X2(goals.lh, goals.la);
    const best1x2 = [
      { sel: "HOME", probability: oneXTwo.home },
      { sel: "DRAW", probability: oneXTwo.draw },
      { sel: "AWAY", probability: oneXTwo.away }
    ].sort((a, b) => b.probability - a.probability)[0];
    const oneXTwoSelection = match.featuredMarkets?.ft1x2?.outcomes?.find((outcome) => outcome.key === best1x2.sel);
    if (Number.isFinite(Number(oneXTwoSelection?.price))) {
      candidates.push({
        fixtureId: String(match.fixtureId),
        match: `${match.home} vs ${match.away}`,
        home: match.home,
        away: match.away,
        market: "1X2",
        sel: best1x2.sel,
        p: best1x2.probability,
        bookOdds: Number(oneXTwoSelection.price),
        fairOdds: oddsFromProb(best1x2.probability),
        edge: Number(best1x2.probability) - (1 / Number(oneXTwoSelection.price)),
        startTime: match.startTime,
        tournamentName: match.tournamentName || "",
        categoryName: match.categoryName || "",
        displayLabel: pickDisplayLabel({ market: "1X2", sel: best1x2.sel }),
        reason: pickReasonText({ market: "1X2", sel: best1x2.sel }),
        source: "history"
      });
    }

    const doubleChanceCandidates = [
      { sel: "1X", probability: oneXTwo.home + oneXTwo.draw },
      { sel: "12", probability: oneXTwo.home + oneXTwo.away },
      { sel: "X2", probability: oneXTwo.draw + oneXTwo.away }
    ];
    for (const option of doubleChanceCandidates) {
      candidates.push(buildCandidate(match, "Double Chance", option.sel, option.probability));
    }

    const pYes = probBTTS(goals.lh, goals.la);
    const pNo = 1 - pYes;
    candidates.push(buildCandidate(match, "BTTS", pYes >= pNo ? "YES" : "NO", Math.max(pYes, pNo)));
    for (const line of GOALS_LINES) {
      const pOver = probTotalOver(line, goals.lt);
      const pUnder = 1 - pOver;
      candidates.push(buildCandidate(match, `Goals ${line}`, pOver >= pUnder ? "OVER" : "UNDER", Math.max(pOver, pUnder)));
    }
  }

  const corners = estCorners(entry);
  if (corners) {
    for (const line of CORNERS_LINES) {
      const pOver = probTotalOver(line, corners.lt);
      const pUnder = 1 - pOver;
      candidates.push(buildCandidate(match, `Corners ${line}`, pOver >= pUnder ? "OVER" : "UNDER", Math.max(pOver, pUnder)));
    }
  }

  const cards = estCards(entry);
  if (cards) {
    for (const line of CARDS_LINES) {
      const pOver = probTotalOver(line, cards.lt);
      const pUnder = 1 - pOver;
      candidates.push(buildCandidate(match, `Cards ${line}`, pOver >= pUnder ? "OVER" : "UNDER", Math.max(pOver, pUnder)));
    }
  }

  return candidates
    .filter(Boolean)
    .filter((candidate) => candidate.p >= minProbability)
    .sort((a, b) => candidateScore(b) - candidateScore(a) || (b.p - a.p) || (b.edge - a.edge) || (a.bookOdds - b.bookOdds));
}

function fallbackCandidatesFromOdds(match) {
  const candidates = [];

  const ft1x2 = normalizedProbabilities(match.featuredMarkets?.ft1x2?.outcomes || []);
  if (ft1x2.length === 3) {
    const best = ft1x2.sort((a, b) => b.probability - a.probability)[0];
    candidates.push(buildFallbackCandidate(
      match,
      "1X2",
      best.key,
      best.probability,
      "Recomandare de fallback bazata pe structura cotelor disponibile pentru 1X2."
    ));
  }

  const btts = normalizedProbabilities(match.featuredMarkets?.btts?.outcomes || []);
  if (btts.length === 2) {
    const best = btts.sort((a, b) => b.probability - a.probability)[0];
    candidates.push(buildFallbackCandidate(
      match,
      "BTTS",
      best.key,
      best.probability,
      "Recomandare de fallback bazata pe piata Ambele marcheaza disponibila in feed-ul curent."
    ));
  }

  const doubleChance = normalizedProbabilities([
    getBookSelection(match, "Double Chance", "1X") ? { key: "1X", price: getBookSelection(match, "Double Chance", "1X")?.price } : null,
    getBookSelection(match, "Double Chance", "12") ? { key: "12", price: getBookSelection(match, "Double Chance", "12")?.price } : null,
    getBookSelection(match, "Double Chance", "X2") ? { key: "X2", price: getBookSelection(match, "Double Chance", "X2")?.price } : null
  ].filter(Boolean));
  if (doubleChance.length === 3) {
    const best = doubleChance
      .filter((candidate) => candidate.key !== "12")
      .sort((a, b) => b.probability - a.probability)[0];
    if (best) {
      candidates.push(buildFallbackCandidate(
        match,
        "Double Chance",
        best.key,
        best.probability,
        "Recomandare de fallback bazata pe piata Double Chance disponibila in feed-ul curent."
      ));
    }
  }

  for (const line of GOALS_LINES) {
    const over = getBookSelection(match, `Goals ${line}`, "OVER");
    const under = getBookSelection(match, `Goals ${line}`, "UNDER");
    const probs = normalizedProbabilities([
      over ? { key: "OVER", price: over.price } : null,
      under ? { key: "UNDER", price: under.price } : null
    ].filter(Boolean));
    if (probs.length === 2) {
      const best = probs.sort((a, b) => b.probability - a.probability)[0];
      candidates.push(buildFallbackCandidate(
        match,
        `Goals ${line}`,
        best.key,
        best.probability,
        "Recomandare de fallback bazata pe linia de goluri disponibila in feed."
      ));
    }
  }

  for (const line of CORNERS_LINES) {
    const over = getBookSelection(match, `Corners ${line}`, "OVER");
    const under = getBookSelection(match, `Corners ${line}`, "UNDER");
    const probs = normalizedProbabilities([
      over ? { key: "OVER", price: over.price } : null,
      under ? { key: "UNDER", price: under.price } : null
    ].filter(Boolean));
    if (probs.length === 2) {
      const best = probs.sort((a, b) => b.probability - a.probability)[0];
      candidates.push(buildFallbackCandidate(
        match,
        `Corners ${line}`,
        best.key,
        best.probability,
        "Fallback din piata de cornere disponibila in feed-ul curent."
      ));
    }
  }

  for (const line of CARDS_LINES) {
    const over = getBookSelection(match, `Cards ${line}`, "OVER");
    const under = getBookSelection(match, `Cards ${line}`, "UNDER");
    const probs = normalizedProbabilities([
      over ? { key: "OVER", price: over.price } : null,
      under ? { key: "UNDER", price: under.price } : null
    ].filter(Boolean));
    if (probs.length === 2) {
      const best = probs.sort((a, b) => b.probability - a.probability)[0];
      candidates.push(buildFallbackCandidate(
        match,
        `Cards ${line}`,
        best.key,
        best.probability,
        "Fallback din piata de cartonase disponibila in feed-ul curent."
      ));
    }
  }

  return candidates.filter(Boolean);
}

export function buildMatchRecommendation(match, getHistEntry) {
  return buildMatchRecommendationPair(match, getHistEntry)?.primary || null;
}

export function buildMatchRecommendationPair(match, getHistEntry) {
  const historyCandidates = getCandidatesForMatch(match, getHistEntry, 0.46)
    .filter((candidate) => Number.isFinite(candidate.bookOdds) && candidate.bookOdds <= MAX_TICKET_LEG_ODDS + 0.15);
  const candidates = historyCandidates.length ? historyCandidates : fallbackCandidatesFromOdds(match);
  if (!candidates.length) return { primary: null, secondary: null, candidates: [] };

  const preferredCandidates = candidates.filter((candidate) => candidate.bookOdds >= MIN_MATCH_RECO_ODDS);
  const scoringPool = preferredCandidates.length ? preferredCandidates : candidates;

  const scored = scoringPool
    .map((candidate) => {
      const score = candidateScore(candidate);
      const profile = getMarketProfile(candidate);
      return { candidate, score, profile };
    })
    .sort((a, b) => b.score - a.score || b.candidate.p - a.candidate.p || b.candidate.edge - a.candidate.edge);

  const best = chooseDisplayedRecommendation(scored) || scored[0]?.candidate || scoringPool[0] || candidates[0];
  if (!best) return { primary: null, secondary: null, candidates: scored.map((entry) => entry.candidate) };
  best.confidence = getRecommendationConfidence(best);

  const secondary = pickSecondaryRecommendation(scored, best);
  if (secondary) secondary.confidence = getRecommendationConfidence(secondary);

  return {
    primary: best,
    secondary: secondary || null,
    candidates: scored.map((entry) => entry.candidate)
  };
}

export function buildTwoWayRows(lines, lambdaTotal, noun) {
  return lines.map((line) => {
    const pOver = probTotalOver(line, lambdaTotal);
    const pUnder = 1 - pOver;
    const best = Math.max(pOver, pUnder);
    const side = pOver >= pUnder ? "Peste" : "Sub";
    return {
      label: `${side} ${line} ${noun}`,
      value: `${pctRounded(best)} • ${fmtOdds(oddsFromProb(best))}`,
      tone: best >= SAFE_THRESHOLD ? "accent" : side === "Sub" ? "warning" : ""
    };
  });
}

export function buildConfidenceModel(entry) {
  const goals = estGoals(entry);
  const corners = estCorners(entry);
  const cards = estCards(entry);
  const signals = [];
  const notes = [];

  if (goals) {
    const pYes = probBTTS(goals.lh, goals.la);
    signals.push(Math.max(pYes, 1 - pYes));
    if (goals.lt >= 2.6) notes.push("Volum ofensiv bun conform modelului de goluri.");
    if (goals.lt <= 2.2) notes.push("Profil de meci mai disciplinat pe total goluri.");
  }
  if (corners) {
    signals.push(Math.max(probTotalOver(8.5, corners.lt), 1 - probTotalOver(8.5, corners.lt)));
    notes.push(`Cornere estimate in jur de ${corners.lt.toFixed(1)} pe meci.`);
  }
  if (cards) {
    signals.push(Math.max(probTotalOver(4.5, cards.lt), 1 - probTotalOver(4.5, cards.lt)));
    notes.push(`Cartonase estimate in jur de ${cards.lt.toFixed(1)} pe meci.`);
  }

  const score = signals.length ? signals.reduce((sum, value) => sum + value, 0) / signals.length : 0;
  const copy = score >= 0.72
    ? "Selectiile au un profil solid si un raport risc/recompensa bun."
    : score >= 0.62
      ? "Exista suport statistic rezonabil pentru cele mai bune piete."
      : "Meciul cere prudenta, dar pastreaza semnale utile pentru analiza.";

  if (!notes.length) notes.push("Analiza se bazeaza cu prioritate pe pietele pentru care istoricul recent este complet.");
  return { score, copy, notes: notes.slice(0, 3) };
}

export function getRiskProfile(avgP) {
  if (avgP >= 0.74) return { label: "Scazut", note: "Bilet echilibrat din selectii foarte solide." };
  if (avgP >= 0.66) return { label: "Controlat", note: "Raport bun risc/recompensa pe piata curenta." };
  return { label: "Mediu", note: "Necesita prudenta, dar pastreaza logica de model." };
}

function evaluateTicket(picks, config) {
  if (!picks.length) return null;
  const target = config.target;
  const totalOdds = picks.reduce((product, pick) => product * pick.bookOdds, 1);
  const combinedProbability = picks.reduce((product, pick) => product * pick.p, 1);
  const avgP = picks.reduce((sum, pick) => sum + pick.p, 0) / picks.length;
  const closeness = Math.abs(totalOdds - target) / target;
  const inTargetWindow = totalOdds >= target * 0.82 && totalOdds <= target * 1.18;
  const preferredMin = config.preferredPicks?.[0] ?? 2;
  const preferredMax = config.preferredPicks?.[1] ?? 7;
  const preferredRangePenalty = picks.length < preferredMin
    ? (preferredMin - picks.length) * 0.3
    : picks.length > preferredMax
      ? (picks.length - preferredMax) * 0.22
      : 0;
  const oddsPenalty = picks.reduce((sum, pick) => {
    if (pick.bookOdds < config.minOdds) return sum + (config.minOdds - pick.bookOdds) * 1.8;
    if (pick.bookOdds > config.maxOdds) return sum + (pick.bookOdds - config.maxOdds) * 2.2;
    return sum;
  }, 0);
  const familyCounts = picks.reduce((map, pick) => {
    const family = marketFamily(pick);
    map.set(family, (map.get(family) || 0) + 1);
    return map;
  }, new Map());
  const marketCounts = picks.reduce((map, pick) => {
    map.set(pick.market, (map.get(pick.market) || 0) + 1);
    return map;
  }, new Map());
  const familyPenalty = Array.from(familyCounts.values()).reduce((sum, count) => sum + Math.max(0, count - 2) * 0.38, 0);
  const marketPenalty = Array.from(marketCounts.values()).reduce((sum, count) => sum + Math.max(0, count - 2) * 0.52, 0);
  const underPenalty = picks.filter((pick) => String(pick.sel) === "UNDER" && marketFamily(pick) === "GOALS").length >= Math.max(3, Math.ceil(picks.length * 0.7)) ? 0.55 : 0;
  const bttsBonus = picks.filter((pick) => marketFamily(pick) === "BTTS").length ? 0.16 : 0;
  const midGoalsBonus = picks.filter((pick) => pick.market === "Goals 2.5").length ? 0.12 : 0;
  const score = closeness * 12 + (1 - avgP) * 2.4 + (1 - combinedProbability) * 0.8 + preferredRangePenalty + oddsPenalty + familyPenalty + marketPenalty + underPenalty - bttsBonus - midGoalsBonus - (inTargetWindow ? 0.6 : 0);
  return { picks: picks.slice(), target, totalOdds, combinedProbability, avgP, closeness, score };
}

function isBetterTicket(candidate, currentBest) {
  if (!candidate) return false;
  if (!currentBest) return true;
  if (candidate.score !== currentBest.score) return candidate.score < currentBest.score;
  if (candidate.combinedProbability !== currentBest.combinedProbability) return candidate.combinedProbability > currentBest.combinedProbability;
  if (candidate.avgP !== currentBest.avgP) return candidate.avgP > currentBest.avgP;
  return candidate.totalOdds < currentBest.totalOdds;
}

function buildTicketForTarget(matches, getHistEntry, config, exclusions = {}) {
  const target = config.target;
  const excludedFixtureIds = exclusions.excludedFixtureIds || new Set();
  const excludedSelectionKeys = exclusions.excludedSelectionKeys || new Set();
  const optionGroups = matches
    .map((match) => {
      if (excludedFixtureIds.has(String(match.fixtureId))) return null;
      const options = getCandidatesForMatch(match, getHistEntry, 0.52)
        .filter((pick) => Number.isFinite(pick.bookOdds) && pick.bookOdds >= config.minOdds && pick.bookOdds <= Math.min(config.maxOdds, MAX_TICKET_LEG_ODDS))
        .filter((pick) => !excludedSelectionKeys.has(`${pick.fixtureId}|${pick.market}|${pick.sel}`))
        .sort((a, b) => candidateScore(b) - candidateScore(a) || b.p - a.p)
        .slice(0, 6);
      return options.length ? { fixtureId: match.fixtureId, options, rank: candidateScore(options[0]) + Math.max(0, options[0].edge) + (options[0].bookOdds / 10) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 16);

  let best = null;
  const maxPicks = config.preferredPicks?.[1] ?? (target >= 20 ? 7 : target >= 10 ? 6 : 5);
  const minPicks = Math.max(2, (config.preferredPicks?.[0] ?? (target >= 20 ? 3 : 2)) - 1);

  function visit(groupIndex, picks, totalOdds) {
    if (picks.length >= minPicks) {
      const evaluated = evaluateTicket(picks, config);
      if (isBetterTicket(evaluated, best)) best = evaluated;
    }
    if (groupIndex >= optionGroups.length || picks.length >= maxPicks) return;

    visit(groupIndex + 1, picks, totalOdds);
    for (const nextPick of optionGroups[groupIndex].options) {
      const nextOdds = totalOdds * nextPick.bookOdds;
      if (nextOdds > target * 2.2) continue;
      picks.push(nextPick);
      visit(groupIndex + 1, picks, nextOdds);
      picks.pop();
    }
  }

  visit(0, [], 1);
  return best;
}

export function buildDisplayedTickets(matches, getHistEntry) {
  const renderedTickets = new Map();
  const usedFixtureIds = new Set();
  const usedSelectionKeys = new Set();

  for (const config of TICKET_CONFIGS) {
    let ticket = buildTicketForTarget(matches, getHistEntry, config, { excludedFixtureIds: usedFixtureIds, excludedSelectionKeys: usedSelectionKeys });
    if (!ticket) {
      ticket = buildTicketForTarget(matches, getHistEntry, config, { excludedSelectionKeys: usedSelectionKeys });
    }
    if (!ticket) {
      ticket = buildTicketForTarget(matches, getHistEntry, config);
    }
    renderedTickets.set(config.key, ticket);
    if (!ticket) continue;
    for (const pick of ticket.picks) {
      usedFixtureIds.add(String(pick.fixtureId));
      usedSelectionKeys.add(`${pick.fixtureId}|${pick.market}|${pick.sel}`);
    }
  }

  return renderedTickets;
}

export { TICKET_CONFIGS };
