import { tool } from "@openai/agents/realtime";

export const getNextFromTodoAgent = tool({
  name: "getNextFromTodoAgent",
  description:
    "Personal to-do manager for Danny. Can read, add, tick, untick, remove, or clear markdown checklist items. Uses GFM checkboxes (- [ ] or - [x]).",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "add", "tick", "untick", "remove", "clear"],
        description: "What action to perform on the todo list.",
      },
      item: {
        type: "string",
        description:
          "The text of the todo item to add, tick, untick, or remove. Required for all actions except 'list' and 'clear'. Note this is just the string, and does not include the - [ ] portion",
      },
      index: {
        type: "integer",
        description:
          "The 1-based index of the item to act on. Optional fallback for tick, untick, or remove if item text is ambiguous or unavailable.",
      },
    },
    required: ["action"],
    additionalProperties: false,
  },
  execute: async (input) => {
    const res = await fetch("http://localhost:3000/api/todo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    const data = await res.json();
    return {
      nextResponse: data.message || "Done.",
    };
  },
});
