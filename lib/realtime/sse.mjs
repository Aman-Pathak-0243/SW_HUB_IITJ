// Server-Sent-Events (SSE) transport helper (Session 16, DL-107). Builds a streaming
// Response that subscribes to one or more broadcaster channels and pushes each event to
// the client as an SSE frame, with an opening snapshot and periodic heartbeats. Used by
// the live-quiz and live-registration routes (app/api/live/*). Node runtime only
// (`export const runtime = "nodejs"` in the route) — SSE needs a long-lived connection,
// which the committed single-instance PM2 fork + the nginx `proxy_buffering off` +
// `proxy_read_timeout 3600s` config (systemRequirements §7) keep open.
//
// The client (an EventSource) auto-reconnects, so a dropped connection simply re-runs
// the snapshot. Snapshots are authoritative; deltas are additive — the client applies
// whichever arrives. Callers publish ONLY display-safe payloads (PII discipline is the
// service's job).
import { subscribe } from "./broadcast.mjs";

const encoder = new TextEncoder();

// Every payload is sent as the DEFAULT SSE message (the `type` discriminator lives INSIDE
// the JSON), so the client needs a single `EventSource.onmessage` handler that switches on
// `data.type` — simpler + more robust than per-type addEventListener wiring.
function frame(payload) {
  const data = JSON.stringify(payload ?? {});
  return encoder.encode(`data: ${data}\n\n`);
}

// Build the SSE Response.
//   channels    — a channel string or array to subscribe to.
//   onOpen()    — optional async fn returning the opening snapshot (an event object or
//                 an array of them) sent right after connect.
//   signal      — the request's AbortSignal (req.signal); closes the stream on disconnect.
//   heartbeatMs — comment-ping interval to keep proxies from timing the connection out.
export function sseResponse({ channels = [], onOpen, signal, heartbeatMs = 25000 } = {}) {
  const chans = Array.isArray(channels) ? channels : [channels];
  let unsubscribers = [];
  let heartbeat = null;
  let closed = false;
  let controllerRef = null;

  function cleanup() {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    for (const u of unsubscribers) { try { u(); } catch { /* ignore */ } }
    unsubscribers = [];
    try { controllerRef?.close(); } catch { /* already closed */ }
  }

  const stream = new ReadableStream({
    async start(controller) {
      controllerRef = controller;
      const send = (payload) => {
        if (closed) return;
        try { controller.enqueue(frame(payload)); } catch { cleanup(); }
      };
      // Subscribe BEFORE the snapshot so no delta fired during the snapshot read is
      // missed (a duplicate/slightly-stale snapshot after a delta is harmless — the
      // client's reducer is idempotent on the current question/leaderboard).
      unsubscribers = chans.map((ch) => subscribe(ch, send));
      try { controller.enqueue(encoder.encode(": connected\n\n")); } catch { /* ignore */ }

      if (typeof onOpen === "function") {
        try {
          const initial = await onOpen();
          if (Array.isArray(initial)) initial.forEach(send);
          else if (initial) send(initial);
        } catch (e) {
          console.warn("[sse] onOpen error:", e?.message ?? e);
        }
      }

      // The client may have disconnected DURING the await above (cancel()/abort ran
      // cleanup() while `heartbeat` was still null, so it cleared nothing). Bail before
      // creating an interval that cleanup() has already run past — otherwise it would be an
      // orphaned (unref'd, no-op) timer ticking for the process lifetime (review).
      if (closed) return;

      heartbeat = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { cleanup(); }
      }, heartbeatMs);
      if (typeof heartbeat.unref === "function") heartbeat.unref();

      if (signal) {
        if (signal.aborted) cleanup();
        else signal.addEventListener("abort", cleanup, { once: true });
      }
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // belt-and-braces with nginx `proxy_buffering off`
    },
  });
}
