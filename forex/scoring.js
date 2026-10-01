const { SIGNALS, SIGNAL_VALUES } = require("./constants");

function validateFactor(factor, index) {
  if (!factor || typeof factor !== "object" || Array.isArray(factor)) {
    throw new TypeError(`Factor at index ${index} must be an object.`);
  }

  if (typeof factor.name !== "string" || !factor.name.trim()) {
    throw new TypeError(`Factor at index ${index} must have a non-empty name.`);
  }

  if (typeof factor.reason !== "string" || !factor.reason.trim()) {
    throw new TypeError(`Factor at index ${index} must have a non-empty reason.`);
  }

  if (typeof factor.signal !== "string" || !factor.signal.trim()) {
    throw new TypeError(`Factor at index ${index} must have a signal.`);
  }
}

function scoreFactors(factors) {
  if (!Array.isArray(factors)) {
    throw new TypeError("Factors must be an array.");
  }

  const counts = {
    positive: 0,
    negative: 0,
    neutral: 0,
  };

  const scoredFactors = factors.map((factor, index) => {
    validateFactor(factor, index);

    const signal = factor.signal.trim().toLowerCase();

    if (!Object.hasOwn(SIGNAL_VALUES, signal)) {
      throw new RangeError(
        `Unknown signal "${factor.signal}" at factor index ${index}. ` +
          `Expected ${Object.values(SIGNALS).join(", ")}.`,
      );
    }

    const score = SIGNAL_VALUES[signal];
    counts[signal] += 1;

    return {
      name: factor.name.trim(),
      signal,
      reason: factor.reason.trim(),
      score,
    };
  });

  const totalScore = scoredFactors.reduce(
    (total, factor) => total + factor.score,
    0,
  );

  let overall = SIGNALS.NEUTRAL;

  if (totalScore > 0) {
    overall = SIGNALS.POSITIVE;
  } else if (totalScore < 0) {
    overall = SIGNALS.NEGATIVE;
  }

  return {
    factors: scoredFactors,
    positiveCount: counts.positive,
    negativeCount: counts.negative,
    neutralCount: counts.neutral,
    totalScore,
    overall,
  };
}

module.exports = {
  scoreFactors,
};
