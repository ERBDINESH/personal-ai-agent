const { normalizeSourceRecord } = require("../source");

const BLS_CPI_SERIES_ID = "CUUR0000SA0";
const BLS_CPI_URL =
  `https://api.bls.gov/publicAPI/v2/timeseries/data/${BLS_CPI_SERIES_ID}` +
  "?latest=true";
const BLS_SUCCESS_STATUS = "REQUEST_SUCCEEDED";

function getFetchedAt(now) {
  let value;

  try {
    value = now();
  } catch {
    throw new Error("BLS fetch timestamp could not be created.");
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("BLS fetch timestamp must be a valid date/time.");
  }

  return date.toISOString();
}

function validateDataPoint(dataPoint) {
  if (!dataPoint || typeof dataPoint !== "object" || Array.isArray(dataPoint)) {
    throw new Error("BLS CPI data point must be an object.");
  }

  if (typeof dataPoint.year !== "string" || !/^\d{4}$/.test(dataPoint.year)) {
    throw new Error("BLS CPI data point has a malformed year.");
  }

  if (
    typeof dataPoint.period !== "string" ||
    !/^M(?:0[1-9]|1[0-3])$/.test(dataPoint.period)
  ) {
    throw new Error("BLS CPI data point has a malformed period.");
  }

  if (
    typeof dataPoint.periodName !== "string" ||
    !dataPoint.periodName.trim()
  ) {
    throw new Error("BLS CPI data point is missing periodName.");
  }

  if (
    typeof dataPoint.value !== "string" ||
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(dataPoint.value.trim())
  ) {
    throw new Error("BLS CPI data point value must be numeric.");
  }

  const numericValue = Number(dataPoint.value);

  if (!Number.isFinite(numericValue)) {
    throw new Error("BLS CPI data point value must be numeric.");
  }

  return {
    year: dataPoint.year,
    period: dataPoint.period,
    periodName: dataPoint.periodName.trim(),
    value: dataPoint.value.trim(),
    numericValue,
    latest: dataPoint.latest ?? null,
    footnotes: dataPoint.footnotes ?? [],
  };
}

function parseBlsResponse(payload, fetchedAt) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("BLS response must be an object.");
  }

  if (payload.status !== BLS_SUCCESS_STATUS) {
    throw new Error(
      `BLS API request failed with status "${payload.status || "unknown"}".`,
    );
  }

  if (
    !payload.Results ||
    typeof payload.Results !== "object" ||
    Array.isArray(payload.Results)
  ) {
    throw new Error("BLS response is missing Results.");
  }

  if (!Array.isArray(payload.Results.series)) {
    throw new Error("BLS response Results.series must be an array.");
  }

  if (payload.Results.series.length === 0) {
    throw new Error(`BLS response is missing series ${BLS_CPI_SERIES_ID}.`);
  }

  const series = payload.Results.series[0];

  if (!series || typeof series !== "object" || Array.isArray(series)) {
    throw new Error(`BLS response is missing series ${BLS_CPI_SERIES_ID}.`);
  }

  if (series.seriesID !== BLS_CPI_SERIES_ID) {
    throw new Error(
      `Unexpected BLS series ID "${series.seriesID || "missing"}"; ` +
        `expected "${BLS_CPI_SERIES_ID}".`,
    );
  }

  if (!Array.isArray(series.data)) {
    throw new Error(`BLS series ${BLS_CPI_SERIES_ID} is missing data.`);
  }

  if (series.data.length === 0) {
    throw new Error(`BLS series ${BLS_CPI_SERIES_ID} contains no data points.`);
  }

  const dataPoint = validateDataPoint(series.data[0]);
  const sourceRecord = normalizeSourceRecord({
    sourceId:
      `bls:${BLS_CPI_SERIES_ID}:${dataPoint.year}:${dataPoint.period}`,
    sourceName: "U.S. Bureau of Labor Statistics",
    sourceType: "official",
    currency: "USD",
    fact:
      `CPI-U All Items index was ${dataPoint.value} for ` +
      `${dataPoint.periodName} ${dataPoint.year}`,
    category: "inflation",
    publishedAt: null,
    fetchedAt,
    url: BLS_CPI_URL,
  });

  return {
    sourceRecord,
    raw: {
      seriesId: series.seriesID,
      ...dataPoint,
    },
  };
}

async function fetchLatestBlsCpi(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("BLS provider options must be an object.");
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());

  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required.");
  }

  if (typeof now !== "function") {
    throw new TypeError("now must be a function.");
  }

  let response;

  try {
    response = await fetchImpl(BLS_CPI_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
  } catch (error) {
    throw new Error(`BLS CPI request failed: ${error.message}`);
  }

  if (!response || typeof response.ok !== "boolean") {
    throw new Error("BLS CPI request returned an invalid HTTP response.");
  }

  if (!response.ok) {
    throw new Error(
      `BLS CPI request failed with HTTP ${response.status || "unknown"}.`,
    );
  }

  let payload;

  try {
    payload = await response.json();
  } catch {
    throw new Error("BLS CPI response contained invalid JSON.");
  }

  return parseBlsResponse(payload, getFetchedAt(now));
}

module.exports = {
  BLS_CPI_SERIES_ID,
  BLS_CPI_URL,
  fetchLatestBlsCpi,
};
