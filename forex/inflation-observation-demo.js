const { fetchCpiObservationInputs } = require("./cpi-changes");
const { createInflationObservation } = require("./inflation-observation");

async function main() {
  try {
    const { cpiChanges, previousRates } =
      await fetchCpiObservationInputs();
    const observation = createInflationObservation(
      cpiChanges,
      previousRates,
    );

    console.log("Inflation observation");
    console.log(
      `Reference: ${observation.referencePeriod.periodName} ` +
        `${observation.referencePeriod.year}\n`,
    );
    console.log("MoM (seasonally adjusted):");
    console.log(`Current: ${observation.metrics.mom.currentPercent}%`);
    console.log(`Previous: ${observation.metrics.mom.previousPercent}%`);
    console.log(`Trend: ${observation.trend.mom}\n`);
    console.log("YoY (not seasonally adjusted):");
    console.log(`Current: ${observation.metrics.yoy.currentPercent}%`);
    console.log(`Previous: ${observation.metrics.yoy.previousPercent}%`);
    console.log(`Trend: ${observation.trend.yoy}\n`);
    console.log(
      `Overall inflation direction: ${observation.summary.direction}\n`,
    );
    console.log(`Source: ${observation.provenance.sourceName}`);
  } catch (error) {
    console.error(`Inflation observation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
};
