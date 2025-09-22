"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function TodoViewer() {
  const [content, setContent] = React.useState<string>("Loading...");
  const [etag, setEtag] = React.useState<string | null>(null);
  const [connected, setConnected] = React.useState(false);

  const fetchContent = async () => {
    const res = await fetch("/api/todo", {
      headers: etag ? { "If-None-Match": etag } : {},
    });

    if (res.ok) {
      const data = await res.json();
      setContent(data.content ?? "Empty file");
      setEtag(data.etag ?? null);
    }
  };

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
    <div className="overflow-auto p-4 border rounded bg-white prose prose-sm max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
