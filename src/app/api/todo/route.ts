import { NextRequest } from "next/server";
import path from "path";
import { promises as fs } from "fs";

const filePath = path.resolve(process.cwd(), "todo.md");

async function readTodoFile(): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

async function writeTodoFile(lines: string[]) {
  await fs.writeFile(filePath, lines.join("\n"), "utf-8");
}

export async function POST(req: NextRequest) {
  const { action, item, index } = await req.json();
  let todos = await readTodoFile();

  switch (action) {
    case "list":
      if (todos.length === 0) {
        return Response.json({ message: "Your todo list is empty." });
      }
      const formatted = todos.map((line, i) => `${i + 1}. ${line}`).join("\n");
      return Response.json({ message: `Here's your todo list:\n${formatted}` });

    case "add":
      if (!item || item.trim() === "") {
        return Response.json({ message: "You must provide an item to add." });
      }
      todos.push(`- [ ] ${item.trim()}`);
      await writeTodoFile(todos);
      return Response.json({ message: `Added: "${item.trim()}"` });

    case "toggle":
      if (typeof index !== "number" || index < 1 || index > todos.length) {
        return Response.json({ message: "Invalid item number." });
      }
      const line = todos[index - 1];
      if (line.includes("[ ]")) {
        todos[index - 1] = line.replace("[ ]", "[x]");
      } else if (line.includes("[x]")) {
        todos[index - 1] = line.replace("[x]", "[ ]");
      }
      await writeTodoFile(todos);
      return Response.json({ message: `Toggled item ${index}` });

    case "remove":
      if (typeof index !== "number" || index < 1 || index > todos.length) {
        return Response.json({ message: "Invalid item number." });
      }
      const removed = todos.splice(index - 1, 1)[0];
      await writeTodoFile(todos);
      return Response.json({ message: `Removed: "${removed}"` });

    case "clear":
      await writeTodoFile([]);
      return Response.json({ message: "Todo list cleared." });

    default:
      return Response.json({ message: "Invalid action." });
  }
}
