const assert = require("node:assert/strict");
const test = require("node:test");
const { routeMessage } = require("../src/router");
const { parseToolSelection } = require("../src/tool-selector");
const { executeTool, getAvailableTools } = require("../src/tools");

function runForexCommand(command) {
  const action = routeMessage(command);

  assert.equal(action.type, "TOOL");
  assert.equal(action.tool, "forex_research");

  return executeTool(action.tool, action.input);
}

test("generates a neutral Forex report", () => {
  const result = runForexCommand(
    "/forex USD | Rates | positive | Rates may rise; " +
      "Inflation | negative | Inflation is elevated; " +
      "Growth | neutral | Data is mixed",
  );

  assert.equal(result.ok, true);
  assert.match(result.answer, /Score: 0/);
  assert.match(result.answer, /Overall: Neutral/);
});

test("generates a positive overall Forex report", () => {
  const result = runForexCommand(
    "/forex EUR | Rates | positive | Rates may rise; " +
      "Growth | positive | Growth is improving; " +
      "Inflation | negative | Inflation is elevated",
  );

  assert.equal(result.ok, true);
  assert.match(result.answer, /Score: 1/);
  assert.match(result.answer, /Overall: Positive/);
});

test("generates a negative overall Forex report", () => {
  const result = runForexCommand(
    "/forex JPY | Rates | negative | Rates may remain low; " +
      "Growth | neutral | Data is mixed",
  );

  assert.equal(result.ok, true);
  assert.match(result.answer, /Score: -1/);
  assert.match(result.answer, /Overall: Negative/);
});

test("reports an invalid signal", () => {
  const result = runForexCommand(
    "/forex GBP | Rates | uncertain | Direction is unclear",
  );

  assert.equal(result.ok, true);
  assert.match(result.answer, /Forex input error: Unknown signal "uncertain"/);
});

test("reports each required malformed input", () => {
  const cases = [
    ["/forex", "Currency is required"],
    ["/forex USD", "At least one factor is required"],
    ["/forex USD | Rates | | Direction is unclear", "missing a signal"],
    ["/forex USD | Rates | neutral |", "missing a reason"],
  ];

  for (const [command, expectedError] of cases) {
    const result = runForexCommand(command);

    assert.equal(result.ok, true);
    assert.match(result.answer, new RegExp(expectedError));
  }
});

test("allows only the explicit command to select Forex research", () => {
  const command =
    "/forex USD | Growth outlook | positive | Growth improved";
  const action = routeMessage(command);

  assert.deepEqual(action, {
    type: "TOOL",
    tool: "forex_research",
    input: "USD | Growth outlook | positive | Growth improved",
  });
  assert.match(
    executeTool(action.tool, action.input).answer,
    /Overall: Positive/,
  );

  const genericTools = getAvailableTools();

  assert.equal(
    genericTools.some((tool) => tool.name === "forex_research"),
    false,
  );
  assert.deepEqual(
    parseToolSelection(
      '{"type":"TOOL","tool":"forex_research","input":"USD"}',
      genericTools,
    ),
    { type: "CHAT" },
  );
});

test("keeps non-command Forex-like input and hello on the chat path", () => {
  assert.deepEqual(
    routeMessage("Growth outlook | positive | Growth improved"),
    { type: "UNRESOLVED" },
  );
  assert.deepEqual(routeMessage("hello"), { type: "UNRESOLVED" });
  assert.deepEqual(
    parseToolSelection('{"type":"CHAT"}', getAvailableTools()),
    { type: "CHAT" },
  );
});

test("preserves existing note routes and generic list selection", () => {
  assert.deepEqual(routeMessage("Save this note: Review Swift actors"), {
    type: "SAVE_NOTE",
    note: "Review Swift actors",
  });

  assert.deepEqual(routeMessage("What did I write about actors?"), {
    type: "SEARCH",
    query: "actors",
  });

  const tools = getAvailableTools();
  const selection = parseToolSelection(
    '{"type":"TOOL","tool":"list_notes","input":""}',
    tools,
  );

  assert.deepEqual(selection, {
    type: "TOOL",
    tool: "list_notes",
    input: "",
  });
  assert.equal(executeTool("list_notes", "").ok, true);
  assert.equal(executeTool("search_notes", "actors").ok, true);
});
