const DEFAULT_EPSILON = 1e-9;
const TREND_VALUES = Object.freeze({
  ACCELERATING: "accelerating",
  COOLING: "cooling",
  UNCHANGED: "unchanged",
  MIXED: "mixed",
  UNKNOWN: "unknown",
});

function requireFinitePercent(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }

  return value;
}

function getPreviousPercent(previousRates, metric) {
  if (previousRates == null || previousRates[metric] == null) {
    return null;
  }

  return requireFinitePercent(
    previousRates[metric].percentChange,
    `Previous ${metric.toUpperCase()} percent`,
  );
}

function classifyTrend(current, previous, epsilon) {
  if (previous === null) {
    return TREND_VALUES.UNKNOWN;
  }

  const difference = current - previous;

  if (Math.abs(difference) <= epsilon) {
    return TREND_VALUES.UNCHANGED;
  }

  return difference > 0 ? TREND_VALUES.ACCELERATING : TREND_VALUES.COOLING;
}

function combineTrends(mom, yoy) {
  if (mom === TREND_VALUES.UNKNOWN || yoy === TREND_VALUES.UNKNOWN) {
    return TREND_VALUES.UNKNOWN;
  }

  if (mom === yoy) {
    return mom;
  }

  return TREND_VALUES.MIXED;
}

function createInflationObservation(cpiChanges, previousRates = null, options = {}) {
  if (!cpiChanges || typeof cpiChanges !== "object") {
    throw new TypeError("CPI changes must be an object.");
  }

  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Inflation observation options must be an object.");
  }

  const epsilon = options.epsilon ?? DEFAULT_EPSILON;

  if (typeof epsilon !== "number" || !Number.isFinite(epsilon) || epsilon < 0) {
    throw new RangeError("epsilon must be a non-negative finite number.");
  }

  const currentMom = requireFinitePercent(
    cpiChanges.mom?.percentChange,
    "Current MoM percent",
  );
  const currentYoy = requireFinitePercent(
    cpiChanges.yoy?.percentChange,
    "Current YoY percent",
  );
  const previousMom = getPreviousPercent(previousRates, "mom");
  const previousYoy = getPreviousPercent(previousRates, "yoy");
  const momTrend = classifyTrend(currentMom, previousMom, epsilon);
  const yoyTrend = classifyTrend(currentYoy, previousYoy, epsilon);

  return {
    referencePeriod: {
      year: cpiChanges.referencePeriod.year,
      month: cpiChanges.referencePeriod.month,
      period: cpiChanges.referencePeriod.period,
      periodName: cpiChanges.referencePeriod.periodName,
    },
    metrics: {
      mom: {
        currentPercent: currentMom,
        previousPercent: previousMom,
      },
      yoy: {
        currentPercent: currentYoy,
        previousPercent: previousYoy,
      },
    },
    trend: {
      mom: momTrend,
      yoy: yoyTrend,
    },
    summary: {
      direction: combineTrends(momTrend, yoyTrend),
    },
    provenance: {
      sourceName: cpiChanges.provenance.sourceName,
      sourceType: cpiChanges.provenance.sourceType,
    },
  };
}

module.exports = {
  DEFAULT_EPSILON,
  TREND_VALUES,
  createInflationObservation,
};
