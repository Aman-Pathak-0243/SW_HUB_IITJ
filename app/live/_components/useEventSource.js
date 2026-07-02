"use client";

// A tiny EventSource hook (Session 16, DL-107). Opens an SSE connection to `url`, parses
// each default `data:` frame as JSON, and calls `onMessage(data)`. The browser
// auto-reconnects on transient drops (re-running the server snapshot), so the consumer
// need only merge state. Closes on unmount / url change. Comments (heartbeats) are
// ignored by EventSource automatically.
import { useEffect, useRef } from "react";

export function useEventSource(url, onMessage) {
  const cb = useRef(onMessage);
  cb.current = onMessage;
  useEffect(() => {
    if (!url || typeof window === "undefined" || typeof window.EventSource === "undefined") return undefined;
    const es = new EventSource(url);
    es.onmessage = (e) => {
      let data;
      try { data = JSON.parse(e.data); } catch { return; }
      cb.current?.(data);
    };
    es.onerror = () => { /* EventSource retries on its own; nothing to do */ };
    return () => es.close();
  }, [url]);
}
