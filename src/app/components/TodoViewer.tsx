"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function TodoViewer() {
  const [content, setContent] = React.useState<string>("Loading...");
  const [etag, setEtag] = React.useState<string | null>(null);
  const [connected, setConnected] = React.useState(false);

  async function fetchContent() {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch("/api/todo");
        if (!res.ok) throw new Error(`Failed with ${res.status}`);
        const data = await res.json();
        setContent(data.content);
        setEtag(data.etag);
        return;
      } catch (err) {
        console.error("fetchContent attempt", attempt + 1, "failed:", err);
        await new Promise((r) => setTimeout(r, 100 * (attempt + 1))); // Backoff
      }
    }
  }

  React.useEffect(() => {
    fetchContent();

    const es = new EventSource("/api/todo/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "changed") {
        fetchContent();
      }
    };

    return () => es.close();
  }, []);

  return (
    <div className="overflow-auto   w-1/3 rounded-xl pt-1 bg-white prose prose-sm max-w-none">
      <div className="flex items-center justify-between px-6 py-3 mb-4 sticky top-0 z-10 text-base border-b bg-white rounded-t-xl">
        <span className="font-semibold">Todo List</span>
        <div className="flex gap-x-2">
          {/* <button
            onClick={handleCopyTodo}
            className="w-24 text-sm px-3 py-1 rounded-md bg-gray-200 hover:bg-gray-300 flex items-center justify-center gap-x-1"
          >
            <ClipboardCopyIcon />
            {justCopied ? "Copied!" : "Copy"}
          </button> */}
        </div>
      </div>
      <div className="p-4">
        {" "}
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            li({ node, children, ...props }) {
              const propsClassNames =
                (node as any)?.properties?.className ?? [];
              const isTaskItem =
                Array.isArray(propsClassNames) &&
                propsClassNames.includes("task-list-item");

              const allChildren = children as React.ReactNode[];
              const firstChild = allChildren[0];

              let isChecked = false;
              if (
                isTaskItem &&
                React.isValidElement(firstChild) &&
                "checked" in firstChild.props
              ) {
                isChecked = firstChild.props.checked === true;
              }

              const inputEl = firstChild;
              const rest = allChildren.slice(1);

              return (
                <li {...props} className="flex items-start gap-2">
                  {inputEl}
                  <span
                    className={`transition-all duration-300 ${
                      isChecked ? "line-through text-gray-400" : ""
                    }`}
                  >
                    {rest}
                  </span>
                </li>
              );
            },

            input({ node, ...props }) {
              return (
                <input
                  {...props}
                  disabled
                  className="mt-1 accent-emerald-600 cursor-default"
                />
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
