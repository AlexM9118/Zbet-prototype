const UI_SCHEMA_VERSION = 2;

const FEATURED_MARKET_DEFINITIONS = {
  ft1x2: {
    key: "ft1x2",
    label: "1X2 (FT)",
    marketId: "10137",
    outcomes: [
      { key: "HOME", label: "Home", outcomeId: "10137" },
      { key: "DRAW", label: "Draw", outcomeId: "10138" },
      { key: "AWAY", label: "Away", outcomeId: "10139" }
    ]
  },
  btts: {
    key: "btts",
    label: "BTTS",
    marketId: "104",
    outcomes: [
      { key: "YES", label: "Yes", outcomeId: "104" },
      { key: "NO", label: "No", outcomeId: "105" }
    ]
  },
  doubleChance: {
    key: "doubleChance",
    label: "Double Chance (FT)",
    marketId: "101902",
    outcomes: [
      { key: "1X", label: "1X", outcomeId: "101902" },
      { key: "12", label: "12", outcomeId: "101903" },
      { key: "X2", label: "X2", outcomeId: "101904" }
    ]
  }
};

function buildTotalsDefinition(market, marketId, overOutcomeId, underOutcomeId) {
  return {
    market,
    selection: "OVER",
    label: `${market} OVER`,
    marketId: String(marketId),
    outcomeId: String(overOutcomeId)
  };
}

function buildUnderDefinition(market, marketId, overOutcomeId, underOutcomeId) {
  return {
    market,
    selection: "UNDER",
    label: `${market} UNDER`,
    marketId: String(marketId),
    outcomeId: String(underOutcomeId)
  };
}

const RECOMMENDATION_MARKET_DEFINITIONS = [
  {
    market: "BTTS",
    selection: "YES",
    label: "BTTS YES",
    marketId: "104",
    outcomeId: "104"
  },
  {
    market: "BTTS",
    selection: "NO",
    label: "BTTS NO",
    marketId: "104",
    outcomeId: "105"
  },
  {
    market: "Double Chance",
    selection: "1X",
    label: "Double Chance 1X",
    marketId: "101902",
    outcomeId: "101902"
  },
  {
    market: "Double Chance",
    selection: "12",
    label: "Double Chance 12",
    marketId: "101902",
    outcomeId: "101903"
  },
  {
    market: "Double Chance",
    selection: "X2",
    label: "Double Chance X2",
    marketId: "101902",
    outcomeId: "101904"
  },
  {
    market: "Goals 1.5",
    selection: "OVER",
    label: "Goals 1.5 OVER",
    marketId: "108",
    outcomeId: "108"
  },
  {
    market: "Goals 1.5",
    selection: "UNDER",
    label: "Goals 1.5 UNDER",
    marketId: "108",
    outcomeId: "109"
  },
  {
    market: "Goals 2.5",
    selection: "OVER",
    label: "Goals 2.5 OVER",
    marketId: "1010",
    outcomeId: "1010"
  },
  {
    market: "Goals 2.5",
    selection: "UNDER",
    label: "Goals 2.5 UNDER",
    marketId: "1010",
    outcomeId: "1011"
  },
  {
    market: "Goals 3.5",
    selection: "OVER",
    label: "Goals 3.5 OVER",
    marketId: "1012",
    outcomeId: "1012"
  },
  {
    market: "Goals 3.5",
    selection: "UNDER",
    label: "Goals 3.5 UNDER",
    marketId: "1012",
    outcomeId: "1013"
  },
  {
    market: "Goals 4.5",
    selection: "OVER",
    label: "Goals 4.5 OVER",
    marketId: "1014",
    outcomeId: "1014"
  },
  {
    market: "Goals 4.5",
    selection: "UNDER",
    label: "Goals 4.5 UNDER",
    marketId: "1014",
    outcomeId: "1015"
  },
  buildTotalsDefinition("Corners 8.5", 10799, 10799, 10800),
  buildUnderDefinition("Corners 8.5", 10799, 10799, 10800),
  buildTotalsDefinition("Corners 9.5", 10803, 10803, 10804),
  buildUnderDefinition("Corners 9.5", 10803, 10803, 10804),
  buildTotalsDefinition("Corners 10.5", 10807, 10807, 10808),
  buildUnderDefinition("Corners 10.5", 10807, 10807, 10808),
  buildTotalsDefinition("Cards 3.5", 10926, 10926, 10927),
  buildUnderDefinition("Cards 3.5", 10926, 10926, 10927),
  buildTotalsDefinition("Cards 4.5", 10930, 10930, 10931),
  buildUnderDefinition("Cards 4.5", 10930, 10930, 10931),
  buildTotalsDefinition("Cards 5.5", 10934, 10934, 10935),
  buildUnderDefinition("Cards 5.5", 10934, 10934, 10935)
];

function buildSelectionKey(market, selection) {
  return `${String(market)}|${String(selection)}`;
}

function indexMarkets(rawMarkets) {
  const marketsById = new Map();

  for (const market of rawMarkets || []) {
    if (!market || market.marketId == null) continue;

    const outcomesById = new Map();
    for (const outcome of market.outcomes || []) {
      if (!outcome || outcome.outcomeId == null) continue;
      outcomesById.set(String(outcome.outcomeId), outcome);
    }

    marketsById.set(String(market.marketId), {
      ...market,
      outcomesById
    });
  }

  return marketsById;
}

function normalizeFeaturedMarket(marketsById, definition) {
  const market = marketsById.get(String(definition.marketId));
  if (!market) return null;

  return {
    key: definition.key,
    label: definition.label,
    marketId: String(definition.marketId),
    bookmakerMarketId: market.bookmakerMarketId ?? null,
    outcomes: definition.outcomes.map((outcomeDef) => {
      const outcome = market.outcomesById.get(String(outcomeDef.outcomeId)) || null;
      return {
        key: outcomeDef.key,
        label: outcomeDef.label,
        outcomeId: String(outcomeDef.outcomeId),
        price: outcome?.price ?? null,
        changedAt: outcome?.changedAt ?? null
      };
    })
  };
}

function buildFeaturedMarkets(rawMarkets) {
  const marketsById = indexMarkets(rawMarkets);
  return {
    ft1x2: normalizeFeaturedMarket(marketsById, FEATURED_MARKET_DEFINITIONS.ft1x2),
    btts: normalizeFeaturedMarket(marketsById, FEATURED_MARKET_DEFINITIONS.btts),
    doubleChance: normalizeFeaturedMarket(marketsById, FEATURED_MARKET_DEFINITIONS.doubleChance)
  };
}

function buildSelectionIndex(rawMarkets) {
  const marketsById = indexMarkets(rawMarkets);
  const out = {};

  for (const definition of RECOMMENDATION_MARKET_DEFINITIONS) {
    const market = marketsById.get(String(definition.marketId));
    const outcome = market?.outcomesById.get(String(definition.outcomeId)) || null;

    out[buildSelectionKey(definition.market, definition.selection)] = {
      market: definition.market,
      selection: definition.selection,
      label: definition.label,
      marketId: String(definition.marketId),
      outcomeId: String(definition.outcomeId),
      bookmakerMarketId: market?.bookmakerMarketId ?? null,
      price: outcome?.price ?? null,
      changedAt: outcome?.changedAt ?? null
    };
  }

  return out;
}

module.exports = {
  UI_SCHEMA_VERSION,
  buildFeaturedMarkets,
  buildSelectionIndex,
  buildSelectionKey
};
