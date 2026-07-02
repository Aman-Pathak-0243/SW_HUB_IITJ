"use client";

// Session 16 (DL-104..107) — the organizer LIVE-QUIZ control panel. Authors the question
// bank and drives the live session (start lobby → next → reveal → end) through the ONE
// gated /api/admin/action registry (quiz.* actions, each re-authorized by assertEventManage
// server-side). Subscribes to the session's SSE stream for the live leaderboard + answer
// progress. The host holds the correct answers locally (from the gated host view), so the
// participant-safe stream is sufficient for the live board.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEventSource } from "../live/_components/useEventSource";

async function runAction(action, extra) {
  const res = await fetch("/api/admin/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Action ${action} failed.`);
  return data;
}

function QuestionForm({ eventItemId, onDone }) {
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState(0);
  const [points, setPoints] = useState(1000);
  const [seconds, setSeconds] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function add() {
    setBusy(true); setError(null);
    try {
      const filled = options.map((t, i) => ({ id: String.fromCharCode(97 + i), text: t })).filter((o) => o.text.trim());
      await runAction("quiz.question.create", {
        eventItemId,
        input: { prompt, options: filled, correctOptionIds: [String.fromCharCode(97 + correct)], points: Number(points), timeLimitSeconds: Number(seconds) },
      });
      setPrompt(""); setOptions(["", "", "", ""]); setCorrect(0);
      onDone?.();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h4 className="mb-2 font-semibold text-gray-800">Add a question</h4>
      <input className="mb-2 w-full rounded border border-gray-300 px-3 py-2" placeholder="Question prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((o, i) => (
          <label key={i} className="flex items-center gap-2">
            <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} title="Mark correct" />
            <input className="w-full rounded border border-gray-300 px-2 py-1" placeholder={`Option ${String.fromCharCode(65 + i)}`} value={o} onChange={(e) => setOptions((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))} />
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1">Points <input type="number" className="w-20 rounded border border-gray-300 px-2 py-1" value={points} onChange={(e) => setPoints(e.target.value)} /></label>
        <label className="flex items-center gap-1">Seconds <input type="number" className="w-16 rounded border border-gray-300 px-2 py-1" value={seconds} onChange={(e) => setSeconds(e.target.value)} /></label>
        <button className="rounded bg-[#003f87] px-4 py-1.5 text-white disabled:opacity-50" disabled={busy} onClick={add}>{busy ? "…" : "Add"}</button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}

export default function LiveQuizHost({ view }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [live, setLive] = useState(view?.state ?? null);

  const session = view?.session ?? null;
  const questions = view?.questions ?? [];
  const correctById = new Map(questions.map((q) => [q.id, new Set((q.correctOptionIds ?? []).map((s) => String(s).toLowerCase()))]));

  useEventSource(session ? `/api/live/quiz/${session.id}` : null, (data) => {
    if (!data) return;
    // Drop a stale full snapshot (older rev) that lands behind a fresher delta (review).
    setLive((prev) => {
      if (!data.status) return { ...(prev ?? {}), ...data };
      if (prev && data.rev != null && prev.rev != null && data.rev < prev.rev) return prev;
      return data;
    });
  });

  async function control(action, extra, refresh = true) {
    setBusy(true); setError(null);
    try {
      await runAction(action, extra);
      if (refresh) router.refresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const status = live?.status ?? session?.status ?? null;

  return (
    <div className="space-y-6">
      {/* Session controls */}
      <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Live session</h3>
          {status && <span className="rounded-full bg-[#003f87] px-3 py-0.5 text-xs font-semibold uppercase text-white">{status}</span>}
        </div>
        {!session ? (
          <button className="rounded bg-[#003f87] px-4 py-2 text-white disabled:opacity-50" disabled={busy || questions.length === 0} onClick={() => control("quiz.session.create", { eventItemId: view.eventItemId })}>
            {questions.length === 0 ? "Add a question first" : "Start live lobby"}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {status !== "active" && status !== "ended" && (
              <button className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={() => control("quiz.session.next", { sessionId: session.id })}>Next question →</button>
            )}
            {status === "active" && (
              <button className="rounded bg-amber-500 px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={() => control("quiz.session.reveal", { sessionId: session.id })}>Reveal answers</button>
            )}
            {status !== "ended" && (
              <button className="rounded bg-rose-600 px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={() => control("quiz.session.end", { sessionId: session.id })}>End quiz</button>
            )}
          </div>
        )}
        {live && (
          <div className="mt-3 text-sm text-gray-600">
            <p>{live.questionNo ? `Question ${live.questionNo} of ${live.totalQuestions}` : "Lobby"} · {live.players ?? 0} players · {live.answeredCount ?? 0} answered</p>
            {live.leaderboard?.top?.length > 0 && (
              <ol className="mt-2 space-y-1">
                {live.leaderboard.top.slice(0, 10).map((e, i) => (
                  <li key={i} className="flex justify-between rounded bg-white px-3 py-1"><span>{e.rank}. {e.name ?? "—"}</span><span className="tabular-nums">{e.score}</span></li>
                ))}
              </ol>
            )}
          </div>
        )}
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      </section>

      {/* Question bank */}
      <section>
        <h3 className="mb-2 font-semibold text-gray-800">Questions ({questions.length})</h3>
        <ul className="mb-3 space-y-2">
          {questions.map((q) => (
            <li key={q.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">{q.prompt}</p>
                  <ul className="mt-1 text-sm text-gray-600">
                    {(q.options ?? []).map((o) => (
                      <li key={o.id} className={correctById.get(q.id)?.has(String(o.id).toLowerCase()) ? "font-semibold text-emerald-700" : ""}>
                        {correctById.get(q.id)?.has(String(o.id).toLowerCase()) ? "✓ " : "• "}{o.text}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-gray-400">{q.points} pts · {q.timeLimitSeconds}s</p>
                </div>
                <button className="text-sm text-rose-600 hover:underline disabled:opacity-50" disabled={busy} onClick={() => control("quiz.question.delete", { questionId: q.id })}>Delete</button>
              </div>
            </li>
          ))}
          {questions.length === 0 && <li className="text-sm text-gray-500">No questions yet — add one below.</li>}
        </ul>
        <QuestionForm eventItemId={view.eventItemId} onDone={() => router.refresh()} />
      </section>
    </div>
  );
}
