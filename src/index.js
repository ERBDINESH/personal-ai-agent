const readline = require("readline");
const { handleMessage } = require("./agent");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function chat() {
  rl.question("You: ", async (input) => {
    const message = input.trim().replace(/^you:\s*/i, "");

    if (message.toLowerCase() === "exit") {
      console.log("\nAI: Bye!");
      rl.close();
      return;
    }

    if (!message) {
      chat();
      return;
    }

    try {
      const result = await handleMessage(message);

      if (result.agentMessage) {
        console.log(`\nAgent: ${result.agentMessage}`);
      }

      console.log(`\nAI: ${result.answer}\n`);
    } catch (error) {
      console.error("\nError:", error.message, "\n");
    }

    chat();
  });
}

console.log("Personal AI Agent");
console.log("Type 'exit' to quit.\n");

chat();
