import { RealtimeItem, tool } from "@openai/agents/realtime";

/**
 * Magic8BallAgent for Danny Cisco
 * Capabilities:
 *  - shakeMagic8Ball → returns one of 20 classic 8-ball answers
 *
 * Notes:
 *  - Local tool only
 *  - Uses Responses API to generate short, voice-friendly replies
 */

/* ===========================
   Agent Instructions
   =========================== */

export const magic8BallAgentInstructions = `You are the MAGIC 8-BALL agent for Danny Cisco.
You return classic Magic 8-Ball responses using a single local tool.

# Tool
- "shakeMagic8Ball" → randomly returns one of 20 fixed Magic 8-Ball phrases

# Output Rules
- One short sentence only. No extra commentary.
- Just return the phrase, no filler. e.g., "Outlook good" or "Don't count on it"
- If Danny didn’t ask a clear yes/no question, say: "Ask a yes-or-no question and shake again."
- Do not embellish or explain.
- Do not invent new responses.

# Safety
- Avoid any factual claims, advice, or interpretation beyond quoting the answer.
`;

/* ===========================
   Local Function Tool
   =========================== */

const MAGIC_8_BALL_RESPONSES = [
  "It is certain",
  "It is decidedly so",
  "Without a doubt",
  "Yes definitely",
  "You may rely on it",
  "As I see it, yes",
  "Most likely",
  "Outlook good",
  "Yes",
  "Signs point to yes",
  "Reply hazy, try again",
  "Ask again later",
  "Better not tell you now",
  "Cannot predict now",
  "Concentrate and ask again",
  "Don't count on it",
  "My reply is no",
  "My sources say no",
  "Outlook not so good",
  "Very doubtful",
];

export const magic8BallAgentTools = [
  {
    type: "function" as const,
    name: "shakeMagic8Ball",
    description: "Shake the Magic 8-Ball and return a classic response.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
];

/* ===========================
   Tool Execution Logic
   =========================== */

function getToolResponse(fName: string, rawArgs: any) {
  switch (fName) {
    case "shakeMagic8Ball": {
      const choice =
        MAGIC_8_BALL_RESPONSES[
          Math.floor(Math.random() * MAGIC_8_BALL_RESPONSES.length)
        ];
      return { response: choice };
    }
    default:
      return { result: true };
  }
}

/* ===========================
   Response Fetch Helper
   =========================== */

async function fetchResponsesMessage(body: any) {
  const res = await fetch("/api/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, parallel_tool_calls: false }),
  });
  if (!res.ok) {
    console.warn(
      "Magic8BallAgent: /api/responses error",
      res.status,
      await res.text()
    );
    return { error: "Something went wrong." };
  }
  return res.json();
}

/* ===========================
   Tool-Call Loop
   =========================== */

async function handleToolCalls(
  body: any,
  response: any,
  addBreadcrumb?: (title: string, data?: any) => void
) {
  let currentResponse = response;

  while (true) {
    if (currentResponse?.error) return { error: "Something went wrong." };

    const outputItems: any[] = currentResponse.output ?? [];
    const functionCalls = outputItems.filter((i) => i.type === "function_call");

    if (functionCalls.length === 0) {
      const assistantMessages = outputItems.filter((i) => i.type === "message");
      const finalText = assistantMessages
        .map((msg: any) =>
          (msg.content ?? [])
            .filter((c: any) => c.type === "output_text")
            .map((c: any) => c.text)
            .join("")
        )
        .join("\n");
      return finalText;
    }

    for (const call of functionCalls) {
      const toolName = call.name;
      const args = call.arguments || "{}";
      const toolRes = getToolResponse(toolName, args);

      if (addBreadcrumb) {
        addBreadcrumb(
          `[magic8BallAgent] function call: ${toolName}`,
          JSON.parse(args)
        );
        addBreadcrumb(
          `[magic8BallAgent] function result: ${toolName}`,
          toolRes
        );
      }

      body.input.push(
        {
          type: "function_call",
          call_id: call.call_id,
          name: call.name,
          arguments: call.arguments,
        },
        {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(toolRes),
        }
      );
    }

    currentResponse = await fetchResponsesMessage(body);
  }
}

/* ===========================
   Public Tool Wrapper
   =========================== */

export const getNextFromMagic8BallAgent = tool({
  name: "getNextFromMagic8BallAgent",
  description:
    "Shake the Magic 8-Ball. If the user asked a yes-or-no question, return one of the 20 classic responses.",
  parameters: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "The yes-or-no style question to pass to the 8-Ball.",
      },
    },
    required: ["question"],
    additionalProperties: false,
  },

  execute: async (input, details) => {
    const { question } = input as { question: string };

    const addBreadcrumb = (details?.context as any)?.addTranscriptBreadcrumb as
      | ((title: string, data?: any) => void)
      | undefined;

    const history: RealtimeItem[] = (details?.context as any)?.history ?? [];
    const filteredLogs = history.filter((log) => log.type === "message");

    const body: any = {
      model: "gpt-4.1",
      tool_choice: "auto",
      tools: [...magic8BallAgentTools],
      input: [
        {
          type: "message",
          role: "system",
          content: magic8BallAgentInstructions,
        },
        {
          type: "message",
          role: "user",
          content: `==== Conversation History (truncated) ====
${JSON.stringify(filteredLogs.slice(-6), null, 2)}

==== Current 8-Ball Question ====
"${question}"
`,
        },
      ],
    };

    const response = await fetchResponsesMessage(body);
    if (response.error) {
      return { nextResponse: "Something went wrong." };
    }

    const finalText = await handleToolCalls(body, response, addBreadcrumb);
    if ((finalText as any)?.error) {
      return { nextResponse: "Something went wrong." };
    }

    return { nextResponse: (finalText as string) || "Done." };
  },
});
