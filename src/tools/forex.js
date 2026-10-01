const { generateForexReport } = require("../../forex/report");

const FOREX_USAGE =
  "/forex CURRENCY | FACTOR | SIGNAL | REASON; FACTOR | SIGNAL | REASON";

function parseForexInput(input) {
  if (typeof input !== "string" || !input.trim()) {
    throw new TypeError("Currency is required.");
  }

  const separatorIndex = input.indexOf("|");

  if (separatorIndex === -1) {
    throw new TypeError("At least one factor is required.");
  }

  const currency = input.slice(0, separatorIndex).trim();
  const factorInput = input.slice(separatorIndex + 1).trim();

  if (!currency) {
    throw new TypeError("Currency is required.");
  }

  if (!factorInput) {
    throw new TypeError("At least one factor is required.");
  }

  const factors = factorInput.split(";").map((entry, index) => {
    const factorNumber = index + 1;
    const fields = entry.split("|");

    if (fields.length !== 3) {
      throw new TypeError(
        `Factor ${factorNumber} must contain a name, signal, and reason.`,
      );
    }

    const [name, signal, reason] = fields.map((field) => field.trim());

    if (!name) {
      throw new TypeError(`Factor ${factorNumber} is missing a name.`);
    }

    if (!signal) {
      throw new TypeError(`Factor ${factorNumber} is missing a signal.`);
    }

    if (!reason) {
      throw new TypeError(`Factor ${factorNumber} is missing a reason.`);
    }

    return { name, signal, reason };
  });

  return { currency, factors };
}

function runForexResearch(input) {
  try {
    const { currency, factors } = parseForexInput(input);

    return {
      ok: true,
      report: generateForexReport(currency, factors),
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
    };
  }
}

function formatForexResult(result) {
  if (result.ok) {
    return result.report;
  }

  return `Forex input error: ${result.error}\nUsage: ${FOREX_USAGE}`;
}

module.exports = {
  FOREX_USAGE,
  formatForexResult,
  parseForexInput,
  runForexResearch,
};
