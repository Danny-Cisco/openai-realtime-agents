import { RealtimeItem, tool } from "@openai/agents/realtime";
import { BOOK_OF_ANSWERS } from "./bookOfAnswersPhrases";

/**
 * BookOfAnswersAgent for Danny Cisco
 * Capabilities:
 *  - openBookOfAnswers → returns one of 376 Book of Answers phrases
 *
 * Notes:
 *  - Local tool only
 *  - Uses Responses API to generate short, voice-friendly replies
 */

/* ===========================
   Agent Instructions
   =========================== */

export const bookOfAnswersAgentInstructions = `You are the BOOK OF ANSWERS agent for Danny Cisco.
You simulate opening the Book of Answers to a random page and returning the phrase found there.

# Tool
- "openBookOfAnswers" → randomly returns one of 376 fixed Book of Answers phrases

# Output Rules
- Respond with exactly one phrase from the Book of Answers.
- Do not add commentary or extra words.
- Example: "TRUST YOUR INSTINCTS" — that's all.
- If Danny didn’t ask a clear question, say: "Ask a question and open the book again."
- Avoid any filler like “The book says...” or “Your answer is…”

# Safety
- Do not interpret the meaning of the answer.
- Do not provide advice, only return the phrase verbatim.
`;

/* ===========================
   Local Function Tool
   =========================== */

export const bookOfAnswersAgentTools = [
  {
    type: "function" as const,
    name: "openBookOfAnswers",
    description: "Open the Book of Answers and return a random phrase.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
];

function getToolResponse(fName: string, rawArgs: any) {
  switch (fName) {
    case "openBookOfAnswers": {
      const response =
        BOOK_OF_ANSWERS[Math.floor(Math.random() * BOOK_OF_ANSWERS.length)];
      return { response };
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
      "BookOfAnswersAgent: /api/responses error",
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
          `[bookOfAnswersAgent] function call: ${toolName}`,
          JSON.parse(args)
        );
        addBreadcrumb(
          `[bookOfAnswersAgent] function result: ${toolName}`,
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

export const getNextFromBookOfAnswersAgent = tool({
  name: "getNextFromBookOfAnswersAgent",
  description:
    "Open the Book of Answers. Returns a single phrase selected at random from the book.",
  parameters: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "The question to pose before opening the Book of Answers.",
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
      tools: [...bookOfAnswersAgentTools],
      input: [
        {
          type: "message",
          role: "system",
          content: bookOfAnswersAgentInstructions,
        },
        {
          type: "message",
          role: "user",
          content: `==== Conversation History (truncated) ====
${JSON.stringify(filteredLogs.slice(-6), null, 2)}

==== Current Book of Answers Question ====
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
