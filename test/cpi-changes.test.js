const assert = require("node:assert/strict");
const test = require("node:test");
const {
  BLS_CPI_MOM_SERIES_ID,
  BLS_CPI_YOY_SERIES_ID,
  BLS_HISTORICAL_URL,
  fetchHistoricalBlsCpi,
  normalizeMonthlyCpiDataPoint,
} = require("../forex/providers/bls");
const {
  calculateCpiChanges,
  fetchLatestCpiChanges,
} = require("../forex/cpi-changes");

const FETCHED_AT = "2026-09-15T12:30:00.000Z";
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

function createDataPoint(year, month, value) {
  return {
    year: String(year),
    period: `M${String(month).padStart(2, "0")}`,
    periodName: MONTH_NAMES[month - 1],
    value: String(value),
  };
}

function createPayload() {
  return {
    status: "REQUEST_SUCCEEDED",
    message: [],
    Results: {
      series: [
        {
          seriesID: BLS_CPI_YOY_SERIES_ID,
          data: [
            createDataPoint(2026, 8, "325.000"),
            createDataPoint(2025, 8, "315.000"),
            {
              ...createDataPoint(2025, 10, "0"),
              value: "-",
            },
            createDataPoint(2026, 7, "323.500"),
          ],
        },
        {
          seriesID: BLS_CPI_MOM_SERIES_ID,
          data: [
            createDataPoint(2026, 8, "324.000"),
            {
              year: "2025",
              period: "M13",
              periodName: "Annual",
              value: "318.000",
            },
            createDataPoint(2025, 8, "310.000"),
            {
              ...createDataPoint(2025, 10, "0"),
              value: "-",
            },
            createDataPoint(2026, 7, "323.000"),
          ],
        },
      ],
    },
  };
}

function getSeries(payload, seriesId) {
  return payload.Results.series.find((series) => series.seriesID === seriesId);
}

function getDataPoint(payload, seriesId, year, period) {
  return getSeries(payload, seriesId).data.find(
    (dataPoint) => dataPoint.year === String(year) && dataPoint.period === period,
  );
}

function createResponse(payload, overrides = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
    ...overrides,
  };
}

function createFetch(payload, calls = []) {
  return async (...args) => {
    calls.push(args);
    return createResponse(payload);
  };
}

function createHistory(saPoints, nsaPoints) {
  return {
    series: {
      [BLS_CPI_MOM_SERIES_ID]: saPoints.map((dataPoint) =>
        normalizeMonthlyCpiDataPoint(BLS_CPI_MOM_SERIES_ID, dataPoint),
      ),
      [BLS_CPI_YOY_SERIES_ID]: nsaPoints.map((dataPoint) =>
        normalizeMonthlyCpiDataPoint(BLS_CPI_YOY_SERIES_ID, dataPoint),
      ),
    },
    fetchedAt: FETCHED_AT,
  };
}

test("posts both CPI series for the injected three-year window", async () => {
  const calls = [];
  const result = await fetchHistoricalBlsCpi({
    fetchImpl: createFetch(createPayload(), calls),
    now: () => new Date(FETCHED_AT),
    currentYear: 2026,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], BLS_HISTORICAL_URL);
  assert.equal(calls[0][1].method, "POST");
  assert.equal(calls[0][1].headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    seriesid: [BLS_CPI_MOM_SERIES_ID, BLS_CPI_YOY_SERIES_ID],
    startyear: "2024",
    endyear: "2026",
  });
  assert.deepEqual(result.request, {
    startYear: "2024",
    endYear: "2026",
  });
  assert.equal(result.fetchedAt, FETCHED_AT);
});

test("normalizes M01 and M12 and rejects M13", () => {
  const january = normalizeMonthlyCpiDataPoint(
    BLS_CPI_MOM_SERIES_ID,
    createDataPoint(2026, 1, "320.1"),
  );
  const december = normalizeMonthlyCpiDataPoint(
    BLS_CPI_MOM_SERIES_ID,
    createDataPoint(2026, 12, "325.2"),
  );

  assert.equal(january.month, 1);
  assert.equal(january.period, "M01");
  assert.equal(december.month, 12);
  assert.equal(december.period, "M12");
  assert.throws(
    () =>
      normalizeMonthlyCpiDataPoint(BLS_CPI_MOM_SERIES_ID, {
        year: "2026",
        period: "M13",
        periodName: "Annual",
        value: "321.0",
      }),
    /M13 is annual/,
  );
});

test("rejects malformed monthly CPI fields", () => {
  for (const [field, value, expectedError] of [
    ["year", "20X6", /malformed year/],
    ["period", "M1", /between M01 and M12/],
    ["periodName", "", /missing periodName/],
    ["value", "not-numeric", /value must be numeric/],
  ]) {
    const dataPoint = createDataPoint(2026, 8, "324.0");
    dataPoint[field] = value;

    assert.throws(
      () => normalizeMonthlyCpiDataPoint(BLS_CPI_MOM_SERIES_ID, dataPoint),
      expectedError,
    );
  }
});

test("sorts unsorted BLS monthly data and finds the latest observation", async () => {
  const history = await fetchHistoricalBlsCpi({
    fetchImpl: createFetch(createPayload()),
    now: () => new Date(FETCHED_AT),
    currentYear: 2026,
  });
  const saData = history.series[BLS_CPI_MOM_SERIES_ID];

  assert.deepEqual(
    saData.map(({ year, period }) => `${year}-${period}`),
    ["2025-M08", "2026-M07", "2026-M08"],
  );
  assert.equal(saData.at(-1).value, "324.000");
  assert.deepEqual(
    history.unavailable[BLS_CPI_MOM_SERIES_ID].map(
      ({ year, period, value }) => ({ year, period, value }),
    ),
    [{ year: "2025", period: "M10", value: "-" }],
  );
});

test("calculates the confirmed live-data scenario with unrelated gaps", async () => {
  const payload = createPayload();
  getDataPoint(payload, BLS_CPI_MOM_SERIES_ID, 2026, "M08").value =
    "334.131";
  getDataPoint(payload, BLS_CPI_MOM_SERIES_ID, 2026, "M07").value =
    "332.813";
  getDataPoint(payload, BLS_CPI_YOY_SERIES_ID, 2026, "M08").value =
    "334.980";
  getDataPoint(payload, BLS_CPI_YOY_SERIES_ID, 2025, "M08").value =
    "323.976";

  const result = await fetchLatestCpiChanges({
    fetchImpl: createFetch(payload),
    now: () => new Date(FETCHED_AT),
    currentYear: 2026,
  });

  assert.equal(result.referencePeriod.period, "M08");
  assert.equal(result.referencePeriod.year, "2026");
  assert.equal(result.mom.current.value, "334.131");
  assert.equal(result.mom.previous.value, "332.813");
  assert.ok(
    Math.abs(
      result.mom.percentChange - (334.131 / 332.813 - 1) * 100,
    ) < 1e-12,
  );
  assert.equal(result.yoy.current.value, "334.980");
  assert.equal(result.yoy.previousYear.value, "323.976");
  assert.ok(
    Math.abs(
      result.yoy.percentChange - (334.98 / 323.976 - 1) * 100,
    ) < 1e-12,
  );
});

test("calculates aligned MoM and YoY changes from exact source values", async () => {
  const result = await fetchLatestCpiChanges({
    fetchImpl: createFetch(createPayload()),
    now: () => new Date(FETCHED_AT),
    currentYear: 2026,
  });

  assert.deepEqual(result.referencePeriod, {
    year: "2026",
    month: 8,
    period: "M08",
    periodName: "August",
  });
  assert.equal(result.mom.seriesId, BLS_CPI_MOM_SERIES_ID);
  assert.equal(result.mom.current.value, "324.000");
  assert.equal(result.mom.current.numericValue, 324);
  assert.equal(result.mom.previous.value, "323.000");
  assert.ok(
    Math.abs(result.mom.percentChange - (324 / 323 - 1) * 100) < 1e-12,
  );
  assert.equal(result.yoy.seriesId, BLS_CPI_YOY_SERIES_ID);
  assert.equal(result.yoy.current.value, "325.000");
  assert.equal(result.yoy.previousYear.value, "315.000");
  assert.ok(
    Math.abs(result.yoy.percentChange - (325 / 315 - 1) * 100) < 1e-12,
  );
  assert.equal(result.fetchedAt, FETCHED_AT);
  assert.equal(result.provenance.endpoint, BLS_HISTORICAL_URL);
  assert.equal("signal" in result, false);
  assert.equal("score" in result, false);
  assert.equal("confidence" in result, false);
});

test("calculates January MoM using December of the previous year", () => {
  const history = createHistory(
    [
      createDataPoint(2026, 1, "320.000"),
      createDataPoint(2025, 12, "318.000"),
    ],
    [
      createDataPoint(2026, 1, "321.000"),
      createDataPoint(2025, 1, "310.000"),
    ],
  );
  const result = calculateCpiChanges(history);

  assert.equal(result.mom.previous.year, "2025");
  assert.equal(result.mom.previous.period, "M12");
  assert.ok(
    Math.abs(result.mom.percentChange - (320 / 318 - 1) * 100) < 1e-12,
  );
});

test("rejects a missing exact previous calendar month", () => {
  const history = createHistory(
    [createDataPoint(2026, 8, "324.000")],
    [
      createDataPoint(2026, 8, "325.000"),
      createDataPoint(2025, 8, "315.000"),
    ],
  );

  assert.throws(
    () => calculateCpiChanges(history),
    /Missing exact previous calendar month/,
  );
});

test("rejects an unavailable exact previous calendar month", async () => {
  const payload = createPayload();
  getDataPoint(payload, BLS_CPI_MOM_SERIES_ID, 2026, "M07").value = "-";

  await assert.rejects(
    fetchLatestCpiChanges({
      fetchImpl: createFetch(payload),
      now: () => new Date(FETCHED_AT),
      currentYear: 2026,
    }),
    /Exact previous calendar month.*is unavailable/,
  );
});

test("rejects a missing exact previous-year month", () => {
  const history = createHistory(
    [
      createDataPoint(2026, 8, "324.000"),
      createDataPoint(2026, 7, "323.000"),
    ],
    [createDataPoint(2026, 8, "325.000")],
  );

  assert.throws(
    () => calculateCpiChanges(history),
    /Missing exact previous-year month/,
  );
});

test("rejects an unavailable exact previous-year month", async () => {
  const payload = createPayload();
  getDataPoint(payload, BLS_CPI_YOY_SERIES_ID, 2025, "M08").value = "-";

  await assert.rejects(
    fetchLatestCpiChanges({
      fetchImpl: createFetch(payload),
      now: () => new Date(FETCHED_AT),
      currentYear: 2026,
    }),
    /Exact previous-year month.*is unavailable/,
  );
});

test("rejects an unavailable latest observation instead of substituting", async () => {
  for (const seriesId of [
    BLS_CPI_MOM_SERIES_ID,
    BLS_CPI_YOY_SERIES_ID,
  ]) {
    const payload = createPayload();
    getDataPoint(payload, seriesId, 2026, "M08").value = "-";

    await assert.rejects(
      fetchLatestCpiChanges({
        fetchImpl: createFetch(payload),
        now: () => new Date(FETCHED_AT),
        currentYear: 2026,
      }),
      new RegExp(`Latest CPI observation for ${seriesId} is unavailable`),
    );
  }
});

test("continues to reject arbitrary malformed historical values", async () => {
  const payload = createPayload();
  getDataPoint(payload, BLS_CPI_MOM_SERIES_ID, 2025, "M10").value = "abc";

  await assert.rejects(
    fetchHistoricalBlsCpi({
      fetchImpl: createFetch(payload),
      now: () => new Date(FETCHED_AT),
      currentYear: 2026,
    }),
    /value must be numeric/,
  );
});

test("rejects mismatched latest SA and NSA reference periods", () => {
  const history = createHistory(
    [
      createDataPoint(2026, 8, "324.000"),
      createDataPoint(2026, 7, "323.000"),
    ],
    [
      createDataPoint(2026, 7, "323.500"),
      createDataPoint(2025, 7, "313.500"),
    ],
  );

  assert.throws(
    () => calculateCpiChanges(history),
    /Latest CPI periods do not match/,
  );
});

test("reports historical network, HTTP, JSON, and BLS status failures", async () => {
  await assert.rejects(
    fetchHistoricalBlsCpi({
      fetchImpl: async () => {
        throw new Error("offline");
      },
    }),
    /BLS CPI history request failed: offline/,
  );

  await assert.rejects(
    fetchHistoricalBlsCpi({
      fetchImpl: async () => createResponse(null, { ok: false, status: 503 }),
    }),
    /HTTP 503/,
  );

  await assert.rejects(
    fetchHistoricalBlsCpi({
      fetchImpl: async () =>
        createResponse(null, {
          json: async () => {
            throw new SyntaxError("bad JSON");
          },
        }),
    }),
    /contained invalid JSON/,
  );

  const failedPayload = createPayload();
  failedPayload.status = "REQUEST_FAILED";

  await assert.rejects(
    fetchHistoricalBlsCpi({
      fetchImpl: createFetch(failedPayload),
      now: () => new Date(FETCHED_AT),
    }),
    /status "REQUEST_FAILED"/,
  );
});
