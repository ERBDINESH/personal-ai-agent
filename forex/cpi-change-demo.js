const { fetchLatestCpiChanges } = require("./cpi-changes");

async function main() {
  try {
    const result = await fetchLatestCpiChanges();

    console.log(
      `Latest CPI reference month: ${result.referencePeriod.periodName} ` +
        `${result.referencePeriod.year}`,
    );
    console.log(
      `MoM CPI (seasonally adjusted): ${result.mom.percentChange}%`,
    );
    console.log(
      `  Current: ${result.mom.current.value}; ` +
        `previous month: ${result.mom.previous.value}`,
    );
    console.log(
      `YoY CPI (not seasonally adjusted): ${result.yoy.percentChange}%`,
    );
    console.log(
      `  Current: ${result.yoy.current.value}; ` +
        `same month previous year: ${result.yoy.previousYear.value}`,
    );
    console.log(`Fetched at: ${result.fetchedAt}`);
  } catch (error) {
    console.error(`CPI change fetch failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
};
