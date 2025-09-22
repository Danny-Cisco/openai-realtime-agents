import { tool } from "@openai/agents/realtime";

export const getNextFromTodoAgent = tool({
  name: "getNextFromTodoAgent",
  description:
    "Personal to-do manager for Danny. Can read, add, toggle, remove, or clear markdown checklist items. use - [ ] or - [x] as GFM standard",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "add", "toggle", "remove", "clear"],
      },
      item: {
        type: "string",
        description:
          "The text of the item to add (only for action = add). Ignored otherwise.",
      },
      index: {
        type: "integer",
        description:
          "The 1-based index of the item to toggle or remove (only for action = toggle or remove).",
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
    return { nextResponse: data.message || "Done." };
  },
});
