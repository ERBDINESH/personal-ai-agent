const assert = require("node:assert/strict");
const test = require("node:test");
const { scoreFactors } = require("../forex/scoring");
const {
  createFactorFromSource,
  normalizeSourceRecord,
} = require("../forex/source");

function createSource(overrides = {}) {
  return {
    sourceId: "fed-rate-2026-09",
    sourceName: "Federal Reserve",
    sourceType: "official",
    currency: "USD",
    fact: "Policy rate expectations increased",
    category: "interest-rates",
    publishedAt: "2026-09-30T14:00:00Z",
    fetchedAt: "2026-09-30T14:05:00Z",
    url: "https://www.federalreserve.gov/example",
    ...overrides,
  };
}

test("normalizes valid official and news source records", () => {
  const official = normalizeSourceRecord(
    createSource({
      sourceType: " OFFICIAL ",
      currency: " usd ",
      category: " INTEREST-RATES ",
    }),
  );
  const news = normalizeSourceRecord(
    createSource({
      sourceId: "news-1",
      sourceName: "Example News",
      sourceType: "NEWS",
      currency: "eur",
      category: "growth",
    }),
  );

  assert.equal(official.sourceType, "official");
  assert.equal(official.currency, "USD");
  assert.equal(official.category, "interest-rates");
  assert.equal(news.sourceType, "news");
  assert.equal(news.currency, "EUR");
});

test("rejects unsupported source types and categories", () => {
  assert.throws(
    () => normalizeSourceRecord(createSource({ sourceType: "social" })),
    /Unsupported sourceType "social"/,
  );
  assert.throws(
    () => normalizeSourceRecord(createSource({ category: "technical" })),
    /Unsupported category "technical"/,
  );
});

test("rejects empty required source text fields", () => {
  for (const field of ["sourceId", "sourceName", "currency", "fact"]) {
    assert.throws(
      () => normalizeSourceRecord(createSource({ [field]: "  " })),
      new RegExp(`${field} must be a non-empty string`),
    );
  }
});

test("accepts valid Z and numeric-offset timestamps", () => {
  const result = normalizeSourceRecord(
    createSource({
      publishedAt: "2026-09-30T14:00:00Z",
      fetchedAt: "2026-09-30T19:35:00+05:30",
    }),
  );

  assert.equal(result.publishedAt, "2026-09-30T14:00:00Z");
  assert.equal(result.fetchedAt, "2026-09-30T19:35:00+05:30");
});

test("rejects invalid or timezone-free source timestamps", () => {
  assert.throws(
    () =>
      normalizeSourceRecord(
        createSource({ publishedAt: "2026-02-30T14:00:00Z" }),
      ),
    /publishedAt must be a valid ISO-8601 date\/time/,
  );
  assert.throws(
    () =>
      normalizeSourceRecord(
        createSource({ publishedAt: "2026-09-30T14:00:00" }),
      ),
    /explicit timezone/,
  );
  assert.throws(
    () =>
      normalizeSourceRecord(
        createSource({ fetchedAt: "2026-09-30T14:05:00" }),
      ),
    /explicit timezone/,
  );
  assert.throws(
    () => normalizeSourceRecord(createSource({ fetchedAt: undefined })),
    /fetchedAt is required/,
  );
});

test("accepts a null publishedAt and requires fetchedAt", () => {
  const result = normalizeSourceRecord(createSource({ publishedAt: null }));

  assert.equal(result.publishedAt, null);
  assert.equal(result.fetchedAt, "2026-09-30T14:05:00Z");
});

test("validates optional HTTP and HTTPS URLs", () => {
  assert.equal(
    normalizeSourceRecord(createSource()).url,
    "https://www.federalreserve.gov/example",
  );
  assert.equal(
    normalizeSourceRecord(createSource({ url: "http://example.com/data" })).url,
    "http://example.com/data",
  );
  assert.equal(normalizeSourceRecord(createSource({ url: null })).url, null);
  assert.throws(
    () => normalizeSourceRecord(createSource({ url: "ftp://example.com" })),
    /valid HTTP or HTTPS URL/,
  );
});

test("converts a source record into a validated factor with provenance", () => {
  const result = createFactorFromSource(createSource(), {
    signal: "positive",
    reason: "Higher policy-rate expectations may support USD",
    confidence: 0.8,
  });

  assert.deepEqual(result.factor, {
    name: "Policy rate expectations increased",
    category: "interest-rates",
    signal: "positive",
    reason: "Higher policy-rate expectations may support USD",
    source: "Federal Reserve",
    observedAt: "2026-09-30T14:00:00Z",
    confidence: 0.8,
  });
  assert.equal(result.sourceRecord.sourceId, "fed-rate-2026-09");
  assert.equal(result.sourceRecord.sourceType, "official");
});

test("uses fetchedAt when publishedAt is unavailable", () => {
  const result = createFactorFromSource(createSource({ publishedAt: null }), {
    signal: "neutral",
    reason: "The release does not change the outlook",
  });

  assert.equal(result.factor.observedAt, "2026-09-30T14:05:00Z");
  assert.equal(result.factor.confidence, null);
});

test("keeps signal and confidence caller-supplied without changing scoring", () => {
  const { factor } = createFactorFromSource(createSource(), {
    signal: "negative",
    reason: "The release may weaken the currency outlook",
    confidence: 0,
  });
  const score = scoreFactors([factor]);

  assert.equal(factor.signal, "negative");
  assert.equal(factor.confidence, 0);
  assert.equal(score.totalScore, -1);
  assert.equal(score.overall, "negative");
  assert.throws(
    () =>
      createFactorFromSource(createSource(), {
        reason: "No signal was supplied",
      }),
    /must have a signal/,
  );
});
