const { generateForexReport } = require("./report");

const factors = [
  {
    name: "Interest rate outlook",
    signal: "positive",
    reason: "Higher rate expectations may support the currency",
  },
  {
    name: "Inflation trend",
    signal: "negative",
    reason: "Persistent inflation may weaken real purchasing power",
  },
  {
    name: "Economic growth",
    signal: "Negative",
    reason: "Recent growth indicators are mixed",
  },
];

console.log(generateForexReport("USD", factors));
