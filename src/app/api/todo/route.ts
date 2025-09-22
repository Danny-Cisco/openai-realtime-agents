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

// At the top:
import { NextResponse } from "next/server";

export async function GET(_req: NextRequest) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const stat = await fs.stat(filePath);
    const etag = `"${stat.size}-${Math.floor(stat.mtimeMs)}"`; // safer ETag

    return new NextResponse(
      JSON.stringify({
        content,
        mtimeMs: stat.mtimeMs,
        etag,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          ETag: etag,
          "X-Todo-MtimeMs": String(stat.mtimeMs),
        },
      }
    );
  } catch (err) {
    console.error("GET /api/todo failed:", err);
    return new NextResponse(
      JSON.stringify({ error: "Could not read todo.md" }),
      { status: 500 }
    );
  }
}

async function writeTodoFile(lines: string[]) {
  await fs.writeFile(filePath, lines.join("\n"), "utf-8");
}

export async function POST(req: NextRequest) {
  const { action, item, index } = await req.json();
  let todos = await readTodoFile();

  const findItemIndex = (): number => {
    if (item) {
      const target = item.trim().toLowerCase();
      const i = todos.findIndex((line) => line.toLowerCase().includes(target));
      if (i !== -1) return i;
    }
    if (typeof index === "number" && index >= 1 && index <= todos.length) {
      return index - 1;
    }
    return -1;
  };

  switch (action) {
    case "list": {
      if (todos.length === 0) {
        return Response.json({ message: "Your todo list is empty." });
      }
      const formatted = todos.map((line, i) => `${i + 1}. ${line}`).join("\n");
      return Response.json({ message: `Here's your todo list:\n${formatted}` });
    }

    case "add": {
      if (!item || item.trim() === "") {
        return Response.json({ message: "You must provide an item to add." });
      }
      todos.push(`- [ ] ${item.trim()}`);
      await writeTodoFile(todos);
      return Response.json({ message: `Added: "${item.trim()}"` });
    }

    case "tick": {
      const i = findItemIndex();
      if (i === -1) {
        return Response.json({ message: `Could not find item to tick.` });
      }
      if (todos[i].startsWith("- [ ]")) {
        todos[i] = todos[i].replace("- [ ]", "- [x]");
        await writeTodoFile(todos);
        return Response.json({ message: `Ticked: "${todos[i]}"` });
      }
      return Response.json({ message: `Item was already ticked.` });
    }

    case "untick": {
      const i = findItemIndex();
      if (i === -1) {
        return Response.json({ message: `Could not find item to untick.` });
      }
      if (todos[i].startsWith("- [x]")) {
        todos[i] = todos[i].replace("- [x]", "- [ ]");
        await writeTodoFile(todos);
        return Response.json({ message: `Unticked: "${todos[i]}"` });
      }
      return Response.json({ message: `Item was already unticked.` });
    }

    case "remove": {
      const i = findItemIndex();
      if (i === -1) {
        return Response.json({ message: `Could not find item to remove.` });
      }
      const removed = todos.splice(i, 1)[0];
      await writeTodoFile(todos);
      return Response.json({ message: `Removed: "${removed}"` });
    }

    case "clear": {
      await writeTodoFile([]);
      return Response.json({ message: "Todo list cleared." });
    }

    case "clearCompleted": {
      const before = todos.length;
      todos = todos.filter((line) => !line.startsWith("- [x]"));
      const removedCount = before - todos.length;

      await writeTodoFile(todos);
      return Response.json({
        message: `Cleared ${removedCount} completed item(s).`,
      });
    }

    default:
      return Response.json({ message: "Invalid action." });
  }
}
