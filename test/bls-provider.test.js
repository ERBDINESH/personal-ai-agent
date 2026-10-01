const assert = require("node:assert/strict");
const test = require("node:test");
const {
  BLS_CPI_SERIES_ID,
  BLS_CPI_URL,
  fetchLatestBlsCpi,
} = require("../forex/providers/bls");

const FETCHED_AT = "2026-09-15T12:30:00.000Z";

function createPayload() {
  return {
    status: "REQUEST_SUCCEEDED",
    responseTime: 100,
    message: [],
    Results: {
      series: [
        {
          seriesID: BLS_CPI_SERIES_ID,
          data: [
            {
              year: "2026",
              period: "M08",
              periodName: "August",
              latest: "true",
              value: "323.976",
              footnotes: [{ code: "", text: "" }],
            },
          ],
        },
      ],
    },
  };
}

function createResponse(payload, overrides = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
    ...overrides,
  };
}

async function fetchFixture(payload, responseOverrides = {}) {
  return fetchLatestBlsCpi({
    fetchImpl: async () => createResponse(payload, responseOverrides),
    now: () => new Date(FETCHED_AT),
  });
}

test("fetches and normalizes the latest official BLS CPI value", async () => {
  const calls = [];
  const payload = createPayload();
  const result = await fetchLatestBlsCpi({
    fetchImpl: async (...args) => {
      calls.push(args);
      return createResponse(payload);
    },
    now: () => new Date(FETCHED_AT),
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], BLS_CPI_URL);
  assert.equal(calls[0][1].method, "GET");
  assert.deepEqual(result.sourceRecord, {
    sourceId: "bls:CUUR0000SA0:2026:M08",
    sourceName: "U.S. Bureau of Labor Statistics",
    sourceType: "official",
    currency: "USD",
    fact: "CPI-U All Items index was 323.976 for August 2026",
    category: "inflation",
    publishedAt: null,
    fetchedAt: FETCHED_AT,
    url: BLS_CPI_URL,
  });
  assert.deepEqual(result.raw, {
    seriesId: BLS_CPI_SERIES_ID,
    year: "2026",
    period: "M08",
    periodName: "August",
    value: "323.976",
    numericValue: 323.976,
    latest: "true",
    footnotes: [{ code: "", text: "" }],
  });
});

test("reports a network rejection", async () => {
  await assert.rejects(
    fetchLatestBlsCpi({
      fetchImpl: async () => {
        throw new Error("connection unavailable");
      },
    }),
    /BLS CPI request failed: connection unavailable/,
  );
});

test("rejects a non-successful HTTP response", async () => {
  await assert.rejects(
    fetchLatestBlsCpi({
      fetchImpl: async () => createResponse(null, { ok: false, status: 503 }),
    }),
    /BLS CPI request failed with HTTP 503/,
  );
});

test("rejects invalid JSON", async () => {
  await assert.rejects(
    fetchLatestBlsCpi({
      fetchImpl: async () =>
        createResponse(null, {
          json: async () => {
            throw new SyntaxError("invalid JSON");
          },
        }),
    }),
    /BLS CPI response contained invalid JSON/,
  );
});

test("rejects a BLS API failure status", async () => {
  const payload = createPayload();
  payload.status = "REQUEST_FAILED";

  await assert.rejects(fetchFixture(payload), /status "REQUEST_FAILED"/);
});

test("rejects missing Results and missing series arrays", async () => {
  const withoutResults = createPayload();
  delete withoutResults.Results;

  await assert.rejects(fetchFixture(withoutResults), /missing Results/);

  const withoutSeries = createPayload();
  delete withoutSeries.Results.series;

  await assert.rejects(fetchFixture(withoutSeries), /series must be an array/);
});

test("rejects missing series and empty CPI data", async () => {
  const missingSeries = createPayload();
  missingSeries.Results.series = [];

  await assert.rejects(
    fetchFixture(missingSeries),
    /missing series CUUR0000SA0/,
  );

  const emptyData = createPayload();
  emptyData.Results.series[0].data = [];

  await assert.rejects(fetchFixture(emptyData), /contains no data points/);
});

test("rejects an unexpected series ID", async () => {
  const payload = createPayload();
  payload.Results.series[0].seriesID = "OTHER_SERIES";

  await assert.rejects(fetchFixture(payload), /Unexpected BLS series ID/);
});

test("rejects a non-numeric CPI value", async () => {
  const payload = createPayload();
  payload.Results.series[0].data[0].value = "not-a-number";

  await assert.rejects(fetchFixture(payload), /value must be numeric/);
});

test("rejects malformed required CPI fields", async () => {
  for (const [field, value, expectedError] of [
    ["year", "20X6", /malformed year/],
    ["period", "August", /malformed period/],
    ["periodName", "", /missing periodName/],
  ]) {
    const payload = createPayload();
    payload.Results.series[0].data[0][field] = value;

    await assert.rejects(fetchFixture(payload), expectedError);
  }
});
