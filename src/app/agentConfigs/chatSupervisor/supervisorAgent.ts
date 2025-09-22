import { RealtimeItem, tool } from "@openai/agents/realtime";

/**
 * Personal Assistant Supervisor Agent for Danny Cisco
 * Capabilities:
 *  - flipACoin (local function tool)
 *  - webSearch  (hosted tool; used for public/general info)
 *
 * Notes:
 *  - We set tool_choice: "auto" to let the model pick tools.
 *  - The hosted web search tool is declared with a canonical shape.
 *  - The local tool (flipACoin) is executed by our handleToolCalls loop.
 *  - Hosted tools are executed server-side by the Responses API (no local call needed).
 */

// Canonical hosted web-search tool (no extra fields)
const hostedWebSearchTool = { type: "web_search" as const };

// Supervisor instructions tailored to a personal assistant for Danny
export const supervisorAgentInstructions = `You are a personal assistant SUPERVISOR agent for Danny Cisco. 
You see all conversation history and tools, and you produce the next message that a junior assistant will read aloud verbatim to Danny.

# Core Role
- Help the junior assistant decide what to say or which tool to call next.
- You may either answer directly or call a tool first and then answer.
- If a tool requires input you don't have, instruct the junior assistant to ask Danny for that input (clearly and succinctly).

# Capabilities & Tooling
- Local function tool: "flipACoin" — returns heads/tails.
- Hosted tool: "web_search" — use for general, public, or time-sensitive information (e.g., facts, how-to, what's new).
- Prefer direct answers for small talk or obvious facts about the ongoing chat context.
- Use web_search when it improves accuracy, recency, or substantiates claims. Cite sources immediately after statements derived from search (e.g., "…according to Source Title [URL]"). Keep citations concise.

# Style & Voice
- Speak to Danny in a friendly, efficient, and clear tone.
- This message is for voice; keep it concise prose (no bullet lists). Prioritize clarity.
- Offer brief next steps when appropriate ("Want me to search that?" / "Shall I flip now?").

# Safety & Boundaries
- Do not provide medical, legal, or financial advice.
- If a request is unsafe or not supported, refuse briefly and offer a safer alternative.

# Tool Use Rules
- For coin requests: call flipACoin.
- For public facts or to verify claims: call web_search and include short citations in the reply.
- If parameters are missing for a tool, ask Danny for the exact missing values before calling.

# Examples
- If Danny says, "Flip a coin for me":
  -> Call flipACoin, then say the result.
- If Danny says, "What’s the latest on SvelteKit routing changes?":
  -> Use web_search. Summarize the top relevant points and include short citations.

# Output
- Return a single short message that the junior assistant can say verbatim.
`;

// Only the tools we actually support for this PA agent
export const supervisorAgentTools = [
  {
    type: "function" as const,
    name: "flipACoin",
    description: "Flip a coin and return 'heads' or 'tails'.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  // Hosted tool is provided via the Responses API tools array (declared above)
];

// Minimal Responses POST wrapper (sequential tool calls preserved)
async function fetchResponsesMessage(body: any) {
  const response = await fetch("/api/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Preserve sequential tool calls to simplify local handling
    body: JSON.stringify({ ...body, parallel_tool_calls: false }),
  });

  if (!response.ok) {
    console.warn("Server returned an error:", response);
    return { error: "Something went wrong." };
  }
  return response.json();
}

// Local execution for function tools (hosted tools run server-side)
function getToolResponse(fName: string) {
  switch (fName) {
    case "flipACoin": {
      const sides = ["heads", "tails"] as const;
      const choice = sides[Math.floor(Math.random() * sides.length)];
      return { result: choice };
    }
    default:
      // Any unknown local tool defaults to a truthy no-op result
      return { result: true };
  }
}

/**
 * Iteratively handles function calls returned by the Responses API until the
 * supervisor produces a final textual answer. Returns that answer as a string.
 *
 * Note:
 * - Hosted tools (e.g., web_search) are invoked by the model and executed by the API.
 * - You'll see a "web_search_call" item in the output stream; you do NOT need to locally execute it.
 * - This loop only locally executes items of type "function_call" (i.e., flipACoin).
 */
async function handleToolCalls(
  body: any,
  response: any,
  addBreadcrumb?: (title: string, data?: any) => void
) {
  let currentResponse = response;

  while (true) {
    if (currentResponse?.error) {
      return { error: "Something went wrong." } as any;
    }

    const outputItems: any[] = currentResponse.output ?? [];
    const functionCalls = outputItems.filter(
      (item) => item.type === "function_call"
    );

    if (functionCalls.length === 0) {
      // No more function calls – return the assistant's final message.
      const assistantMessages = outputItems.filter(
        (item) => item.type === "message"
      );
      const finalText = assistantMessages
        .map((msg: any) => {
          const contentArr = msg.content ?? [];
          return contentArr
            .filter((c: any) => c.type === "output_text")
            .map((c: any) => c.text)
            .join("");
        })
        .join("\n");
      return finalText;
    }

    // Execute local function tools and append outputs
    for (const toolCall of functionCalls) {
      const fName = toolCall.name;
      const args = JSON.parse(toolCall.arguments || "{}");
      const toolRes = getToolResponse(fName);

      if (addBreadcrumb)
        addBreadcrumb(`[supervisorAgent] function call: ${fName}`, args);
      if (addBreadcrumb)
        addBreadcrumb(`[supervisorAgent] function result: ${fName}`, toolRes);

      // Append tool call + result for the model to continue reasoning
      body.input.push(
        {
          type: "function_call",
          call_id: toolCall.call_id,
          name: toolCall.name,
          arguments: toolCall.arguments,
        },
        {
          type: "function_call_output",
          call_id: toolCall.call_id,
          output: JSON.stringify(toolRes),
        }
      );
    }

    // Follow-up request including tool outputs
    currentResponse = await fetchResponsesMessage(body);
  }
}

/**
 * Tool wrapper: getNextResponseFromSupervisor
 * - Feeds system+user messages and tools into Responses
 * - Lets the model choose tools automatically (web_search or flipACoin)
 * - Runs any local function calls (flipACoin) and returns the final supervisor message
 */
export const getNextResponseFromSupervisor = tool({
  name: "getNextResponseFromSupervisor",
  description:
    "Produces the next message for the junior assistant, optionally calling tools (flipACoin, webSearch) to decide or substantiate the answer.",
  parameters: {
    type: "object",
    properties: {
      relevantContextFromLastUserMessage: {
        type: "string",
        description:
          "Key information from the user's most recent message. If the last message added no new info, pass a short empty string.",
      },
    },
    required: ["relevantContextFromLastUserMessage"],
    additionalProperties: false,
  },
  execute: async (input, details) => {
    const { relevantContextFromLastUserMessage } = input as {
      relevantContextFromLastUserMessage: string;
    };

    const addBreadcrumb = (details?.context as any)?.addTranscriptBreadcrumb as
      | ((title: string, data?: any) => void)
      | undefined;

    const history: RealtimeItem[] = (details?.context as any)?.history ?? [];
    const filteredLogs = history.filter((log) => log.type === "message");

    const body: any = {
      model: "gpt-4.1",
      tool_choice: "auto", // let the model pick between web_search or flipACoin (or none)
      tools: [
        ...supervisorAgentTools, // local function: flipACoin
        hostedWebSearchTool, // hosted search tool
      ],
      input: [
        {
          type: "message",
          role: "system",
          content: supervisorAgentInstructions,
        },
        {
          type: "message",
          role: "user",
          content: `==== Conversation History ====
${JSON.stringify(filteredLogs, null, 2)}

==== Relevant Context From Last User Message ===
${relevantContextFromLastUserMessage}
`,
        },
      ],
      // sequential tool calls already enforced in fetchResponsesMessage
    };

    const response = await fetchResponsesMessage(body);
    if (response.error) {
      return { error: "Something went wrong." };
    }

    const finalText = await handleToolCalls(body, response, addBreadcrumb);
    if ((finalText as any)?.error) {
      return { error: "Something went wrong." };
    }

    return { nextResponse: finalText as string };
  },
});
