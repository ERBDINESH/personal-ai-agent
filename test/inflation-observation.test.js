const assert = require("node:assert/strict");
const test = require("node:test");
const {
  BLS_CPI_MOM_SERIES_ID,
  BLS_CPI_YOY_SERIES_ID,
  normalizeMonthlyCpiDataPoint,
} = require("../forex/providers/bls");
const { calculateCpiObservationInputs } = require("../forex/cpi-changes");
const {
  createInflationObservation,
} = require("../forex/inflation-observation");

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function createCpiChanges(momPercent, yoyPercent) {
  return {
    referencePeriod: {
      year: "2026",
      month: 8,
      period: "M08",
      periodName: "August",
    },
    mom: { percentChange: momPercent },
    yoy: { percentChange: yoyPercent },
    provenance: {
      sourceName: "U.S. Bureau of Labor Statistics",
      sourceType: "official",
    },
  };
}

function createPreviousRates(momPercent, yoyPercent) {
  return {
    mom: { percentChange: momPercent },
    yoy: { percentChange: yoyPercent },
  };
}

function createDataPoint(year, month, value) {
  return {
    year: String(year),
    period: `M${String(month).padStart(2, "0")}`,
    periodName: MONTH_NAMES[month - 1],
    value: String(value),
  };
}

function normalizeSeries(seriesId, dataPoints) {
  return dataPoints.map((dataPoint) =>
    normalizeMonthlyCpiDataPoint(seriesId, dataPoint),
  );
}

function createUnavailable(seriesId, year, month) {
  return {
    seriesId,
    year: String(year),
    month,
    period: `M${String(month).padStart(2, "0")}`,
    periodName: MONTH_NAMES[month - 1],
    value: "-",
  };
}

function createHistory(saData, nsaData, unavailable = {}) {
  return {
    series: {
      [BLS_CPI_MOM_SERIES_ID]: normalizeSeries(
        BLS_CPI_MOM_SERIES_ID,
        saData,
      ),
      [BLS_CPI_YOY_SERIES_ID]: normalizeSeries(
        BLS_CPI_YOY_SERIES_ID,
        nsaData,
      ),
    },
    unavailable: {
      [BLS_CPI_MOM_SERIES_ID]:
        unavailable[BLS_CPI_MOM_SERIES_ID] || [],
      [BLS_CPI_YOY_SERIES_ID]:
        unavailable[BLS_CPI_YOY_SERIES_ID] || [],
    },
    fetchedAt: "2026-09-15T12:30:00.000Z",
  };
}

test("classifies MoM acceleration, cooling, and unchanged rates", () => {
  for (const [current, previous, expected] of [
    [0.4, 0.3, "accelerating"],
    [0.2, 0.3, "cooling"],
    [0.3, 0.3, "unchanged"],
  ]) {
    const observation = createInflationObservation(
      createCpiChanges(current, 3),
      createPreviousRates(previous, 3),
    );

    assert.equal(observation.trend.mom, expected);
  }
});

test("classifies YoY acceleration, cooling, and unchanged rates", () => {
  for (const [current, previous, expected] of [
    [3.2, 3.1, "accelerating"],
    [3, 3.1, "cooling"],
    [3.1, 3.1, "unchanged"],
  ]) {
    const observation = createInflationObservation(
      createCpiChanges(0.3, current),
      createPreviousRates(0.3, previous),
    );

    assert.equal(observation.trend.yoy, expected);
  }
});

test("uses configurable tolerance for floating-point equality", () => {
  const unchanged = createInflationObservation(
    createCpiChanges(0.3000000005, 3),
    createPreviousRates(0.3, 3),
  );
  const accelerating = createInflationObservation(
    createCpiChanges(0.3000000005, 3),
    createPreviousRates(0.3, 3),
    { epsilon: 1e-12 },
  );

  assert.equal(unchanged.trend.mom, "unchanged");
  assert.equal(accelerating.trend.mom, "accelerating");
});

test("combines matching, mixed, and unknown trends deterministically", () => {
  const cases = [
    [0.4, 0.3, 3.2, 3.1, "accelerating"],
    [0.2, 0.3, 3, 3.1, "cooling"],
    [0.3, 0.3, 3.1, 3.1, "unchanged"],
    [0.4, 0.3, 3, 3.1, "mixed"],
    [0.4, 0.3, 3.1, 3.1, "mixed"],
  ];

  for (const [mom, previousMom, yoy, previousYoy, expected] of cases) {
    const observation = createInflationObservation(
      createCpiChanges(mom, yoy),
      createPreviousRates(previousMom, previousYoy),
    );

    assert.equal(observation.summary.direction, expected);
  }

  const unknown = createInflationObservation(createCpiChanges(0.4, 3.2));

  assert.equal(unknown.trend.mom, "unknown");
  assert.equal(unknown.trend.yoy, "unknown");
  assert.equal(unknown.summary.direction, "unknown");

  const partiallyUnknown = createInflationObservation(
    createCpiChanges(0.4, 3.2),
    { mom: { percentChange: 0.3 } },
  );

  assert.equal(partiallyUnknown.trend.mom, "accelerating");
  assert.equal(partiallyUnknown.trend.yoy, "unknown");
  assert.equal(partiallyUnknown.summary.direction, "unknown");
});

test("calculates August current and July previous rates from exact history", () => {
  const history = createHistory(
    [
      createDataPoint(2026, 8, 105),
      createDataPoint(2026, 6, 100),
      createDataPoint(2026, 7, 102),
    ],
    [
      createDataPoint(2026, 8, 106),
      createDataPoint(2025, 7, 100),
      createDataPoint(2025, 8, 101),
      createDataPoint(2026, 7, 104),
    ],
  );
  const inputs = calculateCpiObservationInputs(history);
  const observation = createInflationObservation(
    inputs.cpiChanges,
    inputs.previousRates,
  );

  assert.equal(inputs.previousRates.referencePeriod.period, "M07");
  assert.ok(
    Math.abs(inputs.cpiChanges.mom.percentChange - (105 / 102 - 1) * 100) <
      1e-12,
  );
  assert.ok(
    Math.abs(inputs.previousRates.mom.percentChange - (102 / 100 - 1) * 100) <
      1e-12,
  );
  assert.ok(
    Math.abs(inputs.cpiChanges.yoy.percentChange - (106 / 101 - 1) * 100) <
      1e-12,
  );
  assert.ok(
    Math.abs(inputs.previousRates.yoy.percentChange - (104 / 100 - 1) * 100) <
      1e-12,
  );
  assert.equal(observation.trend.mom, "accelerating");
  assert.equal(observation.trend.yoy, "accelerating");
  assert.equal(observation.summary.direction, "accelerating");
  assert.equal("signal" in observation, false);
});

test("calculates previous rates across the January rollover", () => {
  const history = createHistory(
    [
      createDataPoint(2025, 11, 100),
      createDataPoint(2026, 1, 103),
      createDataPoint(2025, 12, 102),
    ],
    [
      createDataPoint(2024, 12, 95),
      createDataPoint(2025, 1, 96),
      createDataPoint(2025, 12, 100),
      createDataPoint(2026, 1, 102),
    ],
  );
  const inputs = calculateCpiObservationInputs(history);

  assert.deepEqual(inputs.previousRates.referencePeriod, {
    year: "2025",
    month: 12,
    period: "M12",
    periodName: "December",
  });
  assert.ok(
    Math.abs(inputs.previousRates.mom.percentChange - (102 / 100 - 1) * 100) <
      1e-12,
  );
  assert.ok(
    Math.abs(inputs.previousRates.yoy.percentChange - (100 / 95 - 1) * 100) <
      1e-12,
  );
});

test("rejects an exact missing prior observation", () => {
  const history = createHistory(
    [createDataPoint(2026, 8, 105), createDataPoint(2026, 7, 102)],
    [
      createDataPoint(2026, 8, 106),
      createDataPoint(2025, 8, 101),
      createDataPoint(2026, 7, 104),
      createDataPoint(2025, 7, 100),
    ],
  );

  assert.throws(
    () => calculateCpiObservationInputs(history),
    /Missing month before previous/,
  );
});

test("rejects an unavailable required prior observation", () => {
  const history = createHistory(
    [createDataPoint(2026, 8, 105), createDataPoint(2026, 7, 102)],
    [
      createDataPoint(2026, 8, 106),
      createDataPoint(2025, 8, 101),
      createDataPoint(2026, 7, 104),
      createDataPoint(2025, 7, 100),
    ],
    {
      [BLS_CPI_MOM_SERIES_ID]: [
        createUnavailable(BLS_CPI_MOM_SERIES_ID, 2026, 6),
      ],
    },
  );

  assert.throws(
    () => calculateCpiObservationInputs(history),
    /month before previous.*is unavailable/,
  );
});

test("rejects a missing previous YoY comparison month", () => {
  const history = createHistory(
    [
      createDataPoint(2026, 8, 105),
      createDataPoint(2026, 7, 102),
      createDataPoint(2026, 6, 100),
    ],
    [
      createDataPoint(2026, 8, 106),
      createDataPoint(2025, 8, 101),
      createDataPoint(2026, 7, 104),
    ],
  );

  assert.throws(
    () => calculateCpiObservationInputs(history),
    /Missing previous YoY comparison month/,
  );
});
