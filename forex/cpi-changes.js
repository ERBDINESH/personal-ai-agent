const {
  BLS_CPI_MOM_SERIES_ID,
  BLS_CPI_YOY_SERIES_ID,
  BLS_HISTORICAL_URL,
  fetchHistoricalBlsCpi,
  sortMonthlyCpiDataPoints,
} = require("./providers/bls");

function findObservation(dataPoints, year, month) {
  return dataPoints.find(
    (dataPoint) => Number(dataPoint.year) === year && dataPoint.month === month,
  );
}

function comparePeriods(left, right) {
  return Number(left.year) - Number(right.year) || left.month - right.month;
}

function getLatestUsableObservation(seriesId, usable, unavailable) {
  const latestUsable = usable.at(-1);
  const latestUnavailable = unavailable.at(-1);

  if (!latestUsable && !latestUnavailable) {
    throw new Error(`Missing monthly data for ${seriesId}.`);
  }

  if (
    latestUnavailable &&
    (!latestUsable || comparePeriods(latestUnavailable, latestUsable) >= 0)
  ) {
    throw new Error(
      `Latest CPI observation for ${seriesId} is unavailable: ` +
        `${latestUnavailable.period} ${latestUnavailable.year}.`,
    );
  }

  return latestUsable;
}

function formatObservation(dataPoint) {
  return {
    year: dataPoint.year,
    month: dataPoint.month,
    period: dataPoint.period,
    periodName: dataPoint.periodName,
    value: dataPoint.value,
    numericValue: dataPoint.numericValue,
  };
}

function calculatePercentChange(current, previous, label) {
  if (previous.numericValue === 0) {
    throw new Error(`${label} comparison CPI value cannot be zero.`);
  }

  return (current.numericValue / previous.numericValue - 1) * 100;
}

function calculateCpiChanges(history) {
  if (!history || typeof history !== "object" || Array.isArray(history)) {
    throw new TypeError("BLS CPI history must be an object.");
  }

  if (!history.series || typeof history.series !== "object") {
    throw new TypeError("BLS CPI history must contain normalized series data.");
  }

  const saData = sortMonthlyCpiDataPoints(
    history.series[BLS_CPI_MOM_SERIES_ID] || [],
  );
  const nsaData = sortMonthlyCpiDataPoints(
    history.series[BLS_CPI_YOY_SERIES_ID] || [],
  );
  const unavailableSeries = history.unavailable || {};
  const unavailableSa = sortMonthlyCpiDataPoints(
    unavailableSeries[BLS_CPI_MOM_SERIES_ID] || [],
  );
  const unavailableNsa = sortMonthlyCpiDataPoints(
    unavailableSeries[BLS_CPI_YOY_SERIES_ID] || [],
  );
  const latestSa = getLatestUsableObservation(
    BLS_CPI_MOM_SERIES_ID,
    saData,
    unavailableSa,
  );
  const latestNsa = getLatestUsableObservation(
    BLS_CPI_YOY_SERIES_ID,
    nsaData,
    unavailableNsa,
  );

  if (
    latestSa.year !== latestNsa.year ||
    latestSa.month !== latestNsa.month
  ) {
    throw new Error(
      `Latest CPI periods do not match: ${BLS_CPI_MOM_SERIES_ID} has ` +
        `${latestSa.period} ${latestSa.year}, while ` +
        `${BLS_CPI_YOY_SERIES_ID} has ${latestNsa.period} ${latestNsa.year}.`,
    );
  }

  const currentYear = Number(latestSa.year);
  const previousMonth = latestSa.month === 1 ? 12 : latestSa.month - 1;
  const previousMonthYear = latestSa.month === 1 ? currentYear - 1 : currentYear;
  const previousSa = findObservation(saData, previousMonthYear, previousMonth);

  if (!previousSa) {
    const unavailablePreviousSa = findObservation(
      unavailableSa,
      previousMonthYear,
      previousMonth,
    );

    if (unavailablePreviousSa) {
      throw new Error(
        `Exact previous calendar month for ${BLS_CPI_MOM_SERIES_ID} is ` +
          `unavailable: ${unavailablePreviousSa.period} ` +
          `${unavailablePreviousSa.year}.`,
      );
    }

    throw new Error(
      `Missing exact previous calendar month for ${BLS_CPI_MOM_SERIES_ID}: ` +
        `${previousMonthYear}-M${String(previousMonth).padStart(2, "0")}.`,
    );
  }

  const previousYearNsa = findObservation(
    nsaData,
    Number(latestNsa.year) - 1,
    latestNsa.month,
  );

  if (!previousYearNsa) {
    const unavailablePreviousYearNsa = findObservation(
      unavailableNsa,
      Number(latestNsa.year) - 1,
      latestNsa.month,
    );

    if (unavailablePreviousYearNsa) {
      throw new Error(
        `Exact previous-year month for ${BLS_CPI_YOY_SERIES_ID} is ` +
          `unavailable: ${unavailablePreviousYearNsa.period} ` +
          `${unavailablePreviousYearNsa.year}.`,
      );
    }

    throw new Error(
      `Missing exact previous-year month for ${BLS_CPI_YOY_SERIES_ID}: ` +
        `${Number(latestNsa.year) - 1}-${latestNsa.period}.`,
    );
  }

  return {
    referencePeriod: {
      year: latestSa.year,
      month: latestSa.month,
      period: latestSa.period,
      periodName: latestSa.periodName,
    },
    mom: {
      seriesId: BLS_CPI_MOM_SERIES_ID,
      current: formatObservation(latestSa),
      previous: formatObservation(previousSa),
      percentChange: calculatePercentChange(latestSa, previousSa, "MoM"),
    },
    yoy: {
      seriesId: BLS_CPI_YOY_SERIES_ID,
      current: formatObservation(latestNsa),
      previousYear: formatObservation(previousYearNsa),
      percentChange: calculatePercentChange(
        latestNsa,
        previousYearNsa,
        "YoY",
      ),
    },
    fetchedAt: history.fetchedAt,
    provenance: {
      sourceName: "U.S. Bureau of Labor Statistics",
      sourceType: "official",
      endpoint: BLS_HISTORICAL_URL,
    },
  };
}

async function fetchLatestCpiChanges(options = {}) {
  const history = await fetchHistoricalBlsCpi(options);

  return calculateCpiChanges(history);
}

module.exports = {
  calculateCpiChanges,
  fetchLatestCpiChanges,
};
