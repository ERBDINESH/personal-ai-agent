const SIGNALS = Object.freeze({
  POSITIVE: "positive",
  NEGATIVE: "negative",
  NEUTRAL: "neutral",
});

const SIGNAL_VALUES = Object.freeze({
  [SIGNALS.POSITIVE]: 1,
  [SIGNALS.NEGATIVE]: -1,
  [SIGNALS.NEUTRAL]: 0,
});

const FACTOR_CATEGORIES = Object.freeze({
  INTEREST_RATES: "interest-rates",
  INFLATION: "inflation",
  GROWTH: "growth",
  EMPLOYMENT: "employment",
  CENTRAL_BANK: "central-bank",
  GEOPOLITICAL: "geopolitical",
  MARKET_SENTIMENT: "market-sentiment",
  OTHER: "other",
});

module.exports = {
  FACTOR_CATEGORIES,
  SIGNALS,
  SIGNAL_VALUES,
};
