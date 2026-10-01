const { scoreFactors } = require("./scoring");

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatCategory(category) {
  return category.split("-").map(capitalize).join(" ");
}

function formatConfidence(confidence) {
  return `${Number((confidence * 100).toFixed(2))}%`;
}

function formatFactor(factor, index) {
  const lines = [
    `${index + 1}. ${factor.name}`,
    `   Category: ${formatCategory(factor.category)}`,
    `   Signal: ${capitalize(factor.signal)}`,
    `   Reason: ${factor.reason}`,
    `   Source: ${factor.source === "manual" ? "Manual" : factor.source}`,
  ];

  if (factor.observedAt !== null) {
    lines.push(`   Observed at: ${factor.observedAt}`);
  }

  if (factor.confidence !== null) {
    lines.push(`   Confidence: ${formatConfidence(factor.confidence)}`);
  }

  return lines.join("\n");
}

function generateForexReport(currencyCode, factors) {
  if (typeof currencyCode !== "string" || !currencyCode.trim()) {
    throw new TypeError("Currency code must be a non-empty string.");
  }

  const currency = currencyCode.trim().toUpperCase();
  const result = scoreFactors(factors);
  const factorLines = result.factors.map(formatFactor);

  const factorsSection =
    factorLines.length > 0 ? factorLines.join("\n\n") : "No factors provided.";

  return (
    "Forex Research Report\n" +
    `Currency: ${currency}\n\n` +
    "Factors:\n\n" +
    `${factorsSection}\n\n` +
    "Summary:\n" +
    `Positive: ${result.positiveCount}\n` +
    `Negative: ${result.negativeCount}\n` +
    `Neutral: ${result.neutralCount}\n` +
    `Score: ${result.totalScore}\n` +
    `Overall: ${capitalize(result.overall)}\n\n` +
    "This is research support only and not a trading instruction."
  );
}

module.exports = {
  generateForexReport,
};
