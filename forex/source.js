const { FACTOR_CATEGORIES, SOURCE_TYPES } = require("./constants");
const { scoreFactors } = require("./scoring");
const { isValidIsoDateTime } = require("./validation");

const categoryValues = Object.values(FACTOR_CATEGORIES);
const sourceTypeValues = Object.values(SOURCE_TYPES);

function requireString(record, field) {
  const value = record[field];

  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }

  return value.trim();
}

function normalizeTimestamp(value, field, required) {
  if (value == null) {
    if (required) {
      throw new TypeError(`${field} is required.`);
    }

    return null;
  }

  if (
    typeof value !== "string" ||
    !isValidIsoDateTime(value.trim(), { requireTimezone: true })
  ) {
    throw new TypeError(
      `${field} must be a valid ISO-8601 date/time with an explicit timezone.`,
    );
  }

  return value.trim();
}

function normalizeUrl(value) {
  if (value == null) {
    return null;
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError("url must be a valid HTTP or HTTPS URL.");
  }

  const normalizedUrl = value.trim();

  try {
    const parsedUrl = new URL(normalizedUrl);

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new TypeError("Unsupported URL protocol.");
    }
  } catch {
    throw new TypeError("url must be a valid HTTP or HTTPS URL.");
  }

  return normalizedUrl;
}

function normalizeSourceRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new TypeError("Source record must be an object.");
  }

  const sourceId = requireString(record, "sourceId");
  const sourceName = requireString(record, "sourceName");
  const sourceType = requireString(record, "sourceType").toLowerCase();
  const currency = requireString(record, "currency").toUpperCase();
  const fact = requireString(record, "fact");
  const category = requireString(record, "category").toLowerCase();

  if (!sourceTypeValues.includes(sourceType)) {
    throw new RangeError(
      `Unsupported sourceType "${record.sourceType}". ` +
        `Expected ${sourceTypeValues.join(", ")}.`,
    );
  }

  if (!categoryValues.includes(category)) {
    throw new RangeError(
      `Unsupported category "${record.category}". ` +
        `Expected ${categoryValues.join(", ")}.`,
    );
  }

  return {
    sourceId,
    sourceName,
    sourceType,
    currency,
    fact,
    category,
    publishedAt: normalizeTimestamp(record.publishedAt, "publishedAt", false),
    fetchedAt: normalizeTimestamp(record.fetchedAt, "fetchedAt", true),
    url: normalizeUrl(record.url),
  };
}

function createFactorFromSource(sourceRecord, factorInput) {
  if (
    !factorInput ||
    typeof factorInput !== "object" ||
    Array.isArray(factorInput)
  ) {
    throw new TypeError("Factor input must be an object.");
  }

  const normalizedSourceRecord = normalizeSourceRecord(sourceRecord);
  const candidateFactor = {
    name: normalizedSourceRecord.fact,
    category: normalizedSourceRecord.category,
    signal: factorInput.signal,
    reason: factorInput.reason,
    source: normalizedSourceRecord.sourceName,
    observedAt:
      normalizedSourceRecord.publishedAt ?? normalizedSourceRecord.fetchedAt,
    confidence: factorInput.confidence,
  };
  const scoredFactor = scoreFactors([candidateFactor]).factors[0];
  const { score, ...factor } = scoredFactor;

  return {
    factor,
    sourceRecord: normalizedSourceRecord,
  };
}

module.exports = {
  createFactorFromSource,
  normalizeSourceRecord,
};
