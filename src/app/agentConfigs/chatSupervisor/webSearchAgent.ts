// agents/webSearchAgent.ts
import { tool, RealtimeItem } from "@openai/agents/realtime";

/**
 * WebSearchAgent for Danny Cisco
 * - Uses the hosted "web_search" tool provided by OpenAI
 * - Returns a short, voice-friendly summary of the results
 * - Only performs informational lookups, not browsing or actions
 */

export const getNextFromWebSearchAgent = tool({
  name: "getNextFromWebSearchAgent",
  description:
    "Searches the web using OpenAI's hosted web_search tool and returns a short, voice-friendly summary.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The natural language query to search for.",
      },
      context_note: {
        type: "string",
        description:
          "Optional short note to clarify Danny's request (e.g., 'latest AI news').",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },

  execute: async (input, details) => {
    const { query, context_note } = input;
    const addBreadcrumb = (details?.context as any)?.addTranscriptBreadcrumb as
      | ((title: string, data?: any) => void)
      | undefined;

    const history: RealtimeItem[] = (details?.context as any)?.history ?? [];
    const filteredLogs = history.filter((log) => log.type === "message");

    const systemPrompt = `You are the WEB SEARCH agent for Danny Cisco.
Use OpenAI's hosted web_search tool to look up the requested topic.

# Instructions
- Always call the web_search tool using the query provided.
- Return a short, clear message with helpful info.
- Speak in a natural tone suitable for voice assistants.
- If the query is too vague, ask for clarification and stop.

# Safety
- Do not make medical, legal, or financial claims.
- Do not fabricate results if the search yields nothing.`;

    const body: any = {
      model: "gpt-4o",
      tool_choice: "auto",
      tools: [
        {
          type: "web_search",
        },
      ],
      input: [
        {
          type: "message",
          role: "system",
          content: systemPrompt,
        },
        {
          type: "message",
          role: "user",
          content: `==== Conversation History (truncated) ====
${JSON.stringify(filteredLogs.slice(-6), null, 2)}

==== Search Task ====
Query: ${query}
${context_note ? `Context: ${context_note}` : ""}`,
        },
      ],
    };

    const res = await fetch("/api/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn("webSearchAgent: /api/responses error", res.status);
      return { nextResponse: "Something went wrong." };
    }

    const json = await res.json();
    if (json.error) {
      return { nextResponse: "Something went wrong." };
    }

    const outputItems: any[] = json.output ?? [];
    const messages = outputItems.filter((i) => i.type === "message");
    const finalText = messages
      .map((msg: any) =>
        (msg.content ?? [])
          .filter((c: any) => c.type === "output_text")
          .map((c: any) => c.text)
          .join("")
      )
      .join("\n");

    if (addBreadcrumb) {
      addBreadcrumb(`[webSearchAgent] search result`, { query, finalText });
    }

    return { nextResponse: finalText || "Done." };
  },
});
