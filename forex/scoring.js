const {
  FACTOR_CATEGORIES,
  SIGNALS,
  SIGNAL_VALUES,
} = require("./constants");

const categoryValues = Object.values(FACTOR_CATEGORIES);

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidIsoDateTime(value) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:Z|[+-](\d{2}):(\d{2}))?$/i,
  );

  if (!match) {
    return false;
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = secondText === undefined ? 0 : Number(secondText);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= (daysInMonth[month - 1] || 0) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
}

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
