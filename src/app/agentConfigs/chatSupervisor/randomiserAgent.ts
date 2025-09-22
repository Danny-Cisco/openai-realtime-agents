// agents/randomiserAgent.ts
import { RealtimeItem, tool } from "@openai/agents/realtime";

/**
 * RandomiserAgent for Danny Cisco
 * Capabilities (local function tools only):
 *  - flipACoin        → returns "heads" or "tails"
 *  - rollDice         → supports common dice patterns
 *  - pickFromOptions  → pick 1 random option from a provided list
 *
 * Notes:
 *  - We route via the Responses API so the model can compose a short, voice-friendly reply.
 *  - Local tools are executed in-process by handleToolCalls; no hosted tools here.
 *  - We keep the final message concise and read-aloud ready.
 */

/* ===========================
   Agent Instructions
   =========================== */

export const randomiserAgentInstructions = `You are the RANDOMISER agent for Danny Cisco.
You must produce a single short, voice-friendly message and, when needed, call exactly one local tool to generate randomness.

# Tools
- "flipACoin" → return "heads" or "tails".
- "rollDice" → roll dice and report the total and (briefly) the individual rolls.
- "pickFromOptions" → pick one option at random from the provided list. If the list is empty, ask for options.

# Output Rules
- Be concise and natural for voice. One sentence is preferred.
- For dice: return total and, if space allows, a compact breakdown, e.g., "You rolled 13 (4, 5, 4)."
- For coin: just say the result, e.g., "It’s heads."
- For picks: say the chosen item clearly. If items contain punctuation, keep it verbatim.

# Parameter Discipline
- If required inputs are missing (e.g., no options), ask Danny for the missing info in one short sentence and STOP.
- Do not invent or assume defaults if the user provided explicit parameters.

# Safety
- No medical, legal, financial, or sensitive claims. This agent only randomises.
`;

/* ===========================
   Local Function Tools
   =========================== */

export const randomiserAgentTools = [
  {
    type: "function" as const,
    name: "flipACoin",
    description: "Flip a fair coin and return 'heads' or 'tails'.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "rollDice",
    description:
      "Roll n dice with s sides each, plus optional modifier. Returns the individual rolls and total.",
    parameters: {
      type: "object",
      properties: {
        count: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Number of dice to roll (e.g., 1..100).",
        },
        sides: {
          type: "integer",
          minimum: 2,
          maximum: 1000,
          description: "Number of sides per die (e.g., 6, 20).",
        },
        modifier: {
          type: "integer",
          description: "Optional integer modifier added to the total.",
        },
      },
      required: ["count", "sides"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "pickFromOptions",
    description:
      "Pick one item at random from a provided list of strings. Returns the chosen string.",
    parameters: {
      type: "object",
      properties: {
        options: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          description: "Non-empty list of options to choose from.",
        },
      },
      required: ["options"],
      additionalProperties: false,
    },
  },
];

/* ===========================
   Responses API Wrapper
   =========================== */

async function fetchResponsesMessage(body: any) {
  const res = await fetch("/api/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Keep sequential tool calls for simplicity
    body: JSON.stringify({ ...body, parallel_tool_calls: false }),
  });
  if (!res.ok) {
    console.warn(
      "RandomiserAgent: /api/responses error",
      res.status,
      await res.text()
    );
    return { error: "Something went wrong." };
  }
  return res.json();
}

/* ===========================
   Local Execution of Tools
   =========================== */

function getToolResponse(fName: string, rawArgs: any) {
  switch (fName) {
    case "flipACoin": {
      const sides = ["heads", "tails"] as const;
      const choice = sides[Math.floor(Math.random() * sides.length)];
      return { result: choice };
    }
    case "rollDice": {
      const {
        count,
        sides,
        modifier = 0,
      } = JSON.parse(rawArgs || "{}") as {
        count: number;
        sides: number;
        modifier?: number;
      };

      const rolls: number[] = [];
      for (let i = 0; i < count; i++) {
        // Uniform integer in [1, sides]
        rolls.push(1 + Math.floor(Math.random() * sides));
      }
      const baseTotal = rolls.reduce((a, b) => a + b, 0);
      const total = baseTotal + (modifier ?? 0);
      return { rolls, baseTotal, modifier, total };
    }
    case "pickFromOptions": {
      const { options } = JSON.parse(rawArgs || "{}") as { options: string[] };
      if (!options || options.length === 0) {
        return { error: "No options provided." };
      }
      const choice = options[Math.floor(Math.random() * options.length)];
      return { choice };
    }
    default:
      return { result: true };
  }
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
    if (currentResponse?.error) {
      return { error: "Something went wrong." } as any;
    }

    const outputItems: any[] = currentResponse.output ?? [];
    const functionCalls = outputItems.filter((i) => i.type === "function_call");

    if (functionCalls.length === 0) {
      // Final assistant message
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
          `[randomiserAgent] function call: ${toolName}`,
          JSON.parse(args)
        );
        addBreadcrumb(
          `[randomiserAgent] function result: ${toolName}`,
          toolRes
        );
      }

      // Feed the result back
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

/**
 * getNextFromRandomiserAgent
 * - The triage agent calls this with structured params.
 * - We construct an instruction + user message that tells the model exactly what to do.
 * - The model will call ONE of our local tools, then return a short, voice-ready message.
 */
export const getNextFromRandomiserAgent = tool({
  name: "getNextFromRandomiserAgent",
  description:
    "Randomisation specialist for Danny: flips coins, rolls dice, or picks from a list. Returns a short voice-friendly message.",
  parameters: {
    type: "object",
    properties: {
      task: {
        type: "string",
        enum: ["coin", "dice", "pick"],
        description: "Which randomisation to perform.",
      },
      // Dice params
      count: {
        type: "integer",
        minimum: 1,
        description: "Number of dice (only for task='dice').",
      },
      sides: {
        type: "integer",
        minimum: 2,
        description: "Sides per die (only for task='dice').",
      },
      modifier: {
        type: "integer",
        description: "Optional integer modifier for dice total.",
      },
      // Pick params
      options: {
        type: "array",
        items: { type: "string" },
        description:
          "List of options to randomly choose from (only for task='pick').",
      },
      // Optional natural-language context to echo
      context_note: {
        type: "string",
        description:
          "Optional short note to clarify Danny’s request (e.g., 'pick a color for the logo').",
      },
    },
    required: ["task"],
    additionalProperties: false,
  },

  execute: async (input, details) => {
    const { task, count, sides, modifier, options, context_note } = input as {
      task: "coin" | "dice" | "pick";
      count?: number;
      sides?: number;
      modifier?: number;
      options?: string[];
      context_note?: string;
    };

    const addBreadcrumb = (details?.context as any)?.addTranscriptBreadcrumb as
      | ((title: string, data?: any) => void)
      | undefined;

    // Build a precise user message for the model to avoid ambiguity
    let userDirective = "";
    if (task === "coin") {
      userDirective = `Task: flip a coin. Return a single short sentence with the result.`;
    } else if (task === "dice") {
      userDirective = `Task: roll dice. count=${count ?? "MISSING"}, sides=${
        sides ?? "MISSING"
      }, modifier=${
        modifier ?? 0
      }. If any required value is missing, ask for it in one short sentence and stop. Otherwise, call rollDice and return a concise sentence with total and a compact breakdown.`;
    } else if (task === "pick") {
      userDirective = `Task: pick from options. options=${JSON.stringify(
        options ?? []
      )}. If options is empty, ask for options in one short sentence and stop. Otherwise, call pickFromOptions and return a concise sentence with the chosen item.`;
    }

    if (context_note && context_note.trim().length > 0) {
      userDirective += ` Context: ${context_note.trim()}`;
    }

    const history: RealtimeItem[] = (details?.context as any)?.history ?? [];
    const filteredLogs = history.filter((log) => log.type === "message");

    const body: any = {
      model: "gpt-4.1",
      tool_choice: "auto",
      tools: [...randomiserAgentTools],
      input: [
        {
          type: "message",
          role: "system",
          content: randomiserAgentInstructions,
        },
        {
          type: "message",
          role: "user",
          content: `==== Conversation History (truncated) ====
${JSON.stringify(filteredLogs.slice(-6), null, 2)}

==== Current Randomisation Request ====
${userDirective}
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
