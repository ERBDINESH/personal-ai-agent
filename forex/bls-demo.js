const { fetchLatestBlsCpi } = require("./providers/bls");

async function main() {
  try {
    const result = await fetchLatestBlsCpi();

    console.log("Normalized BLS CPI source record:");
    console.log(JSON.stringify(result.sourceRecord, null, 2));
    console.log("\nRaw latest BLS CPI data point:");
    console.log(JSON.stringify(result.raw, null, 2));
  } catch (error) {
    console.error(`BLS CPI fetch failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
};
