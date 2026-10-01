const assert = require("node:assert/strict");
const test = require("node:test");

test("routes CLI messages through the complete agent flow", async (t) => {
  const modelPath = require.resolve("../src/model");
  const selectorPath = require.resolve("../src/tool-selector");
  const agentPath = require.resolve("../src/agent");
  const toolsPath = require.resolve("../src/tools");
  const model = require(modelPath);
  const tools = require(toolsPath);
  const originalCallModel = model.callModel;
  const originalExecuteTool = tools.executeTool;
  const modelCalls = [];
  const toolCalls = [];

  model.callModel = async (messages) => {
    const systemMessage = messages[0].content;
    const userMessage = messages[messages.length - 1].content;
    const isToolSelection = systemMessage.includes("You select a tool");

    modelCalls.push({
      type: isToolSelection ? "tool-selection" : "chat",
      message: userMessage,
    });

    if (isToolSelection && userMessage === "What notes do I have?") {
      return '{"type":"TOOL","tool":"list_notes","input":""}';
    }

    if (isToolSelection) {
      return '{"type":"CHAT"}';
    }

    return `Chat response: ${userMessage}`;
  };

  tools.executeTool = (name, input) => {
    toolCalls.push(name);
    return originalExecuteTool(name, input);
  };

  delete require.cache[selectorPath];
  delete require.cache[agentPath];

  t.after(() => {
    model.callModel = originalCallModel;
    tools.executeTool = originalExecuteTool;
    delete require.cache[selectorPath];
    delete require.cache[agentPath];
  });

  const { handleMessage } = require(agentPath);
  const bareForex = "Growth outlook | positive | Growth improved";
  const bareResult = await handleMessage(bareForex);

  assert.equal(bareResult.agentMessage, undefined);
  assert.equal(bareResult.answer, `Chat response: ${bareForex}`);
  assert.deepEqual(toolCalls, []);
  assert.deepEqual(modelCalls, [{ type: "chat", message: bareForex }]);

  const forexResult = await handleMessage(
    "/forex USD | Growth outlook | positive | Growth improved",
  );

  assert.equal(forexResult.agentMessage, 'Using tool "forex_research"...');
  assert.match(forexResult.answer, /Overall: Positive/);
  assert.deepEqual(toolCalls, ["forex_research"]);

  const searchResult = await handleMessage("What did I write about actors?");

  assert.equal(
    searchResult.agentMessage,
    'Searching workspace for "actors"...',
  );
  assert.equal(toolCalls.at(-1), "search_notes");

  const listResult = await handleMessage("What notes do I have?");

  assert.equal(listResult.agentMessage, 'Using tool "list_notes"...');
  assert.equal(toolCalls.at(-1), "list_notes");

  const toolCallCount = toolCalls.length;
  const helloResult = await handleMessage("hello");

  assert.equal(helloResult.agentMessage, undefined);
  assert.equal(helloResult.answer, "Chat response: hello");
  assert.equal(toolCalls.length, toolCallCount);
  assert.deepEqual(modelCalls.slice(-2), [
    { type: "tool-selection", message: "hello" },
    { type: "chat", message: "hello" },
  ]);
});
