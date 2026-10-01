const assert = require("node:assert/strict");
const test = require("node:test");
const { generateForexReport } = require("../forex/report");
const { scoreFactors } = require("../forex/scoring");
const { runForexResearch } = require("../src/tools/forex");

function createFactor(overrides = {}) {
  return {
    name: "Growth outlook",
    signal: "positive",
    reason: "Growth improved",
    ...overrides,
  };
}

test("normalizes the old three-field factor shape with defaults", () => {
  const result = scoreFactors([createFactor()]);

  assert.deepEqual(result.factors[0], {
    name: "Growth outlook",
    category: "other",
    signal: "positive",
    reason: "Growth improved",
    source: "manual",
    observedAt: null,
    confidence: null,
    score: 1,
  });
});

test("normalizes and reports an explicit structured factor", () => {
  const factor = createFactor({
    category: "growth",
    source: "Research desk",
    observedAt: "2026-09-30T14:45:00+05:30",
    confidence: 0.7,
  });
  const result = scoreFactors([factor]);
  const report = generateForexReport("USD", [factor]);

  assert.deepEqual(result.factors[0], {
    ...factor,
    score: 1,
  });
  assert.match(report, /Category: Growth/);
  assert.match(report, /Source: Research desk/);
  assert.match(report, /Observed at: 2026-09-30T14:45:00\+05:30/);
  assert.match(report, /Confidence: 70%/);
});

test("rejects an unknown category", () => {
  assert.throws(
    () => scoreFactors([createFactor({ category: "technical" })]),
    /Unknown category "technical"/,
  );
});

test("accepts confidence boundary values", () => {
  assert.equal(
    scoreFactors([createFactor({ confidence: 0 })]).factors[0].confidence,
    0,
  );
  assert.equal(
    scoreFactors([createFactor({ confidence: 1 })]).factors[0].confidence,
    1,
  );
});

test("rejects confidence below zero and above one", () => {
  assert.throws(
    () => scoreFactors([createFactor({ confidence: -0.01 })]),
    /confidence must be a number from 0 to 1/,
  );
  assert.throws(
    () => scoreFactors([createFactor({ confidence: 1.01 })]),
    /confidence must be a number from 0 to 1/,
  );
});

test("accepts a valid observedAt and rejects an invalid one", () => {
  const observedAt = "2026-10-01T09:30:00Z";

  assert.equal(
    scoreFactors([createFactor({ observedAt })]).factors[0].observedAt,
    observedAt,
  );
  assert.throws(
    () =>
      scoreFactors([
        createFactor({ observedAt: "2026-02-30T09:30:00Z" }),
      ]),
    /valid ISO-8601 date\/time/,
  );
});

test("does not weight scoring by confidence", () => {
  const result = scoreFactors([
    createFactor({ confidence: 0 }),
    createFactor({
      name: "Inflation outlook",
      category: "inflation",
      signal: "negative",
      reason: "Inflation remains elevated",
      confidence: 1,
    }),
  ]);

  assert.equal(result.totalScore, 0);
  assert.equal(result.overall, "neutral");
  assert.deepEqual(
    result.factors.map((factor) => factor.score),
    [1, -1],
  );
});

test("keeps the existing Forex CLI payload compatible", () => {
  const result = runForexResearch(
    "USD | Growth outlook | positive | Growth improved",
  );

  assert.equal(result.ok, true);
  assert.match(result.report, /Category: Other/);
  assert.match(result.report, /Source: Manual/);
  assert.doesNotMatch(result.report, /Observed at:/);
  assert.doesNotMatch(result.report, /Confidence:/);
  assert.match(result.report, /Overall: Positive/);
});
