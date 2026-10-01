const {
  FACTOR_CATEGORIES,
  SIGNALS,
  SIGNAL_VALUES,
} = require("./constants");
const { isValidIsoDateTime } = require("./validation");

const categoryValues = Object.values(FACTOR_CATEGORIES);

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

function normalizeFactor(factor, index) {
  validateFactor(factor, index);

  const signal = factor.signal.trim().toLowerCase();

  if (!Object.hasOwn(SIGNAL_VALUES, signal)) {
    throw new RangeError(
      `Unknown signal "${factor.signal}" at factor index ${index}. ` +
        `Expected ${Object.values(SIGNALS).join(", ")}.`,
    );
  }

  let category = FACTOR_CATEGORIES.OTHER;

  if (factor.category != null) {
    if (typeof factor.category !== "string" || !factor.category.trim()) {
      throw new TypeError(
        `Factor at index ${index} must have a non-empty category when supplied.`,
      );
    }

    category = factor.category.trim().toLowerCase();

    if (!categoryValues.includes(category)) {
      throw new RangeError(
        `Unknown category "${factor.category}" at factor index ${index}. ` +
          `Expected ${categoryValues.join(", ")}.`,
      );
    }
  }

  let source = "manual";

  if (factor.source != null) {
    if (typeof factor.source !== "string" || !factor.source.trim()) {
      throw new TypeError(
        `Factor at index ${index} must have a non-empty source when supplied.`,
      );
    }

    source = factor.source.trim();
  }

  let observedAt = null;

  if (factor.observedAt != null) {
    if (
      typeof factor.observedAt !== "string" ||
      !isValidIsoDateTime(factor.observedAt.trim())
    ) {
      throw new TypeError(
        `Factor at index ${index} must have a valid ISO-8601 date/time.`,
      );
    }

    observedAt = factor.observedAt.trim();
  }

  let confidence = null;

  if (factor.confidence != null) {
    if (
      typeof factor.confidence !== "number" ||
      !Number.isFinite(factor.confidence) ||
      factor.confidence < 0 ||
      factor.confidence > 1
    ) {
      throw new RangeError(
        `Factor at index ${index} confidence must be a number from 0 to 1.`,
      );
    }

    confidence = factor.confidence;
  }

  return {
    name: factor.name.trim(),
    category,
    signal,
    reason: factor.reason.trim(),
    source,
    observedAt,
    confidence,
    score: SIGNAL_VALUES[signal],
  };
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
    const normalizedFactor = normalizeFactor(factor, index);

    counts[normalizedFactor.signal] += 1;

    return normalizedFactor;
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
