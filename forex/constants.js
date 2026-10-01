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

module.exports = {
  SIGNALS,
  SIGNAL_VALUES,
};
