export function getOutcomeLabel(marketKey, outcome) {
  const key = String(outcome?.key || "").toUpperCase();
  if (marketKey === "ft1x2") {
    return { HOME: "1", DRAW: "X", AWAY: "2" }[key] || outcome?.label || key || "—";
  }
  if (marketKey === "btts") {
    return { YES: "Da", NO: "Nu" }[key] || outcome?.label || key || "—";
  }
  return outcome?.label || key || "—";
}

export function rowsFromFeaturedMarket(featuredMarket, marketKey, fmtOdds) {
  if (!featuredMarket?.outcomes?.length) return [];
  return featuredMarket.outcomes.map((outcome) => ({
    label: getOutcomeLabel(marketKey, outcome),
    value: fmtOdds(outcome.price)
  }));
}

function factorial(n) {
  let value = 1;
  for (let i = 2; i <= n; i += 1) value *= i;
  return value;
}

function poissonPMF(k, lambda) {
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
}

function poissonCDF(k, lambda) {
  let sum = 0;
  for (let i = 0; i <= k; i += 1) sum += poissonPMF(i, lambda);
  return sum;
}

export function probTotalOver(line, lambdaTotal) {
  const threshold = Math.floor(line) + 1;
  return 1 - poissonCDF(threshold - 1, lambdaTotal);
}

export function probBTTS(lh, la) {
  const pH0 = Math.exp(-lh);
  const pA0 = Math.exp(-la);
  const p00 = Math.exp(-(lh + la));
  return 1 - pH0 - pA0 + p00;
}

export function prob1X2(lh, la, maxGoals = 7) {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let h = 0; h <= maxGoals; h += 1) {
    const pH = poissonPMF(h, lh);
    for (let a = 0; a <= maxGoals; a += 1) {
      const p = pH * poissonPMF(a, la);
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
    }
  }
  const total = home + draw + away || 1;
  return { home: home / total, draw: draw / total, away: away / total };
}

function safeAvg(a, b) {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return (x + y) / 2;
}

export function estGoals(entry) {
  const hs = entry?.homeStats;
  const as = entry?.awayStats;
  if (!hs || !as) return null;
  if ((hs.homeMatches || 0) < 1 || (as.awayMatches || 0) < 1) return null;
  const lh = safeAvg(hs.homeGF, as.awayGA);
  const la = safeAvg(as.awayGF, hs.homeGA);
  if (!Number.isFinite(lh) || !Number.isFinite(la)) return null;
  return { lh, la, lt: lh + la };
}

export function estCorners(entry) {
  const hs = entry?.homeStats;
  const as = entry?.awayStats;
  if (!hs || !as) return null;
  const lh = safeAvg(hs.homeCornersFor, as.awayCornersAgainst);
  const la = safeAvg(as.awayCornersFor, hs.homeCornersAgainst);
  if (!Number.isFinite(lh) || !Number.isFinite(la)) return null;
  if (lh === 0 && la === 0) return null;
  return { lt: lh + la };
}

export function estCards(entry) {
  const hs = entry?.homeStats;
  const as = entry?.awayStats;
  if (!hs || !as) return null;
  const lh = safeAvg(hs.homeYCFor, as.awayYCAgainst);
  const la = safeAvg(as.awayYCFor, hs.homeYCAgainst);
  if (!Number.isFinite(lh) || !Number.isFinite(la)) return null;
  if (lh === 0 && la === 0) return null;
  return { lt: lh + la };
}
