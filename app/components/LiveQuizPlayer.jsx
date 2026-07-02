"use client";

// Session 16 (DL-104..107) — the participant LIVE-QUIZ view. Subscribes to the session's
// SSE stream and renders the authoritative state: lobby → an active question (with a
// client countdown derived from the SERVER's questionStartedAt/deadline, purely a UX aid)
// → reveal (correct answer + my result + leaderboard) → final leaderboard. Answers post to
// the login-only /api/live/quiz/answer route; the server re-checks the time window and
// scores authoritatively, and never returns correctness until reveal (anti-cheat).
import { useEffect, useState } from "react";
import { useEventSource } from "../live/_components/useEventSource";
import { isSelectionCorrect } from "../../lib/quiz/forms.mjs";

const OPTION_TONES = ["bg-rose-500", "bg-sky-500", "bg-amber-500", "bg-emerald-500", "bg-violet-500", "bg-pink-500", "bg-teal-500", "bg-orange-500"];

function Leaderboard({ lb }) {
  if (!lb?.top?.length) return <p className="text-sm text-gray-500">No scores yet.</p>;
  return (
    <ol className="mt-2 space-y-1">
      {lb.top.map((e, i) => (
        <li key={`${e.rank}-${i}`} className={`flex items-center justify-between rounded-md px-3 py-1.5 ${e.isMe ? "bg-[#003f87] text-white" : "bg-white"}`}>
          <span className="font-medium">{e.rank}. {e.name ?? "—"}{e.isMe ? " (you)" : ""}</span>
          <span className="tabular-nums">{e.score}</span>
        </li>
      ))}
    </ol>
  );
}

export default function LiveQuizPlayer({ sessionId, initial = null }) {
  const [st, setSt] = useState(initial ?? { status: "pending" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Locally lock the UI the instant a member answers (before the snapshot round-trips).
  const [answeredFor, setAnsweredFor] = useState({}); // questionId -> selectedOptionId
  const [, setTick] = useState(0);

  useEventSource(sessionId ? `/api/live/quiz/${sessionId}` : null, (data) => {
    if (!data) return;
    // A full snapshot carries `status`; partial deltas (answered/lobby) shallow-merge.
    // Drop a full snapshot whose `rev` is OLDER than what we already have (a stale onOpen
    // snapshot can arrive behind a fresher transition delta — review).
    setSt((prev) => {
      if (!data.status) return { ...prev, ...data };
      if (data.rev != null && prev.rev != null && data.rev < prev.rev) return prev;
      return data;
    });
    // Seed the local "I answered this" record from a per-connection snapshot (onOpen /
    // reconnect carries my own answer) so a later SHARED reveal broadcast — which has no
    // per-viewer myAnswer — still shows my result correctly.
    if (data.question?.id && data.myAnswer?.selectedOptionIds?.length) {
      setAnsweredFor((m) => (m[data.question.id] !== undefined ? m : { ...m, [data.question.id]: data.myAnswer.selectedOptionIds[0] }));
    }
  });

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  const q = st.question ?? null;
  const answeredThis = q ? !!st.myAnswer || answeredFor[q.id] !== undefined : false;
  // Recomputed on every 500ms tick-driven re-render (deadline is the SERVER's; this is a
  // display aid only — the server re-checks the window on submit).
  const remainingMs = st.status === "active" && st.deadline ? Math.max(0, new Date(st.deadline).getTime() - Date.now()) : null;
  const timeUp = remainingMs != null && remainingMs <= 0;

  async function submit(optionId) {
    if (!q || answeredThis || busy || timeUp) return;
    setBusy(true);
    setError(null);
    setAnsweredFor((m) => ({ ...m, [q.id]: optionId })); // optimistic lock
    try {
      const res = await fetch("/api/live/quiz/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, questionId: q.id, selectedOptionIds: [optionId] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Roll back the optimistic lock on a real failure (not "already answered").
        if (data?.code !== "QUESTION_NOT_ACTIVE" && data?.code !== "ANSWER_WINDOW_CLOSED") {
          setAnsweredFor((m) => { const c = { ...m }; delete c[q.id]; return c; });
        }
        throw new Error(data?.error || "Could not submit your answer.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <div className="mb-3 flex items-center justify-between text-sm text-gray-500">
      <span>{st.totalQuestions ? `Question ${st.questionNo} of ${st.totalQuestions}` : "Live quiz"}</span>
      <span>{st.players ?? 0} player{(st.players ?? 0) === 1 ? "" : "s"}</span>
    </div>
  );

  if (st.status === "pending") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
        {header}
        <p className="text-lg font-semibold text-[#003f87]">Get ready!</p>
        <p className="mt-1 text-gray-500">Waiting for the host to start the quiz…</p>
      </div>
    );
  }

  if (st.status === "ended") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-lg font-bold text-[#003f87]">Final leaderboard</h3>
        {st.leaderboard?.me && <p className="mt-1 text-sm text-gray-600">You finished #{st.leaderboard.me.rank ?? "—"} with {st.leaderboard.me.score ?? 0} points.</p>}
        <Leaderboard lb={st.leaderboard} />
      </div>
    );
  }

  const correct = new Set((st.correctOptionIds ?? []).map((s) => String(s).toLowerCase()));
  const mySelArr = st.myAnswer?.selectedOptionIds ?? (q && answeredFor[q.id] !== undefined ? [answeredFor[q.id]] : []);
  const mySel = new Set(mySelArr.map((s) => String(s).toLowerCase()));
  // My reveal result is derived LOCALLY (from the revealed correct set + my known
  // selection) so it is correct even when it arrives via a shared reveal broadcast that
  // carries no per-viewer myAnswer.
  const iAnswered = mySelArr.length > 0;
  const myCorrect = iAnswered && isSelectionCorrect(st.correctOptionIds ?? [], mySelArr);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      {header}
      {q ? (
        <>
          <p className="mb-4 text-xl font-semibold text-gray-900">{q.prompt}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(q.options ?? []).map((opt, i) => {
              const isCorrect = st.status === "reveal" && correct.has(String(opt.id).toLowerCase());
              const isMine = mySel.has(String(opt.id).toLowerCase());
              const dim = st.status === "reveal" && !isCorrect;
              return (
                <button
                  key={opt.id}
                  disabled={st.status !== "active" || answeredThis || timeUp || busy}
                  onClick={() => submit(opt.id)}
                  className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left text-white transition ${OPTION_TONES[i % OPTION_TONES.length]} ${dim ? "opacity-40" : ""} ${isCorrect ? "ring-4 ring-green-300" : ""} ${isMine ? "outline outline-2 outline-white" : ""} disabled:cursor-not-allowed`}
                >
                  <span className="font-bold">{String.fromCharCode(65 + i)}</span>
                  <span>{opt.text}</span>
                  {isCorrect && <span className="ml-auto">✓</span>}
                </button>
              );
            })}
          </div>

          {st.status === "active" && (
            <div className="mt-4 text-center text-sm text-gray-600">
              {answeredThis ? (
                <span className="font-medium text-emerald-600">Answer locked in — waiting for others…</span>
              ) : timeUp ? (
                <span className="font-medium text-amber-600">Time&apos;s up — waiting for the host…</span>
              ) : (
                <span>Time left: <strong className="tabular-nums">{Math.ceil((remainingMs ?? 0) / 1000)}s</strong> · {st.answeredCount ?? 0} answered</span>
              )}
            </div>
          )}

          {st.status === "reveal" && (
            <div className="mt-4">
              {iAnswered ? (
                <p className={`text-center font-semibold ${myCorrect ? "text-emerald-600" : "text-rose-600"}`}>
                  {myCorrect ? `Correct!${st.myAnswer?.pointsAwarded ? ` +${st.myAnswer.pointsAwarded} points` : ""}` : "Not quite."}
                </p>
              ) : (
                <p className="text-center text-gray-500">You didn&apos;t answer this one.</p>
              )}
              <h4 className="mt-4 text-sm font-semibold text-gray-700">Leaderboard</h4>
              <Leaderboard lb={st.leaderboard} />
            </div>
          )}
        </>
      ) : (
        <p className="text-gray-500">Waiting for the next question…</p>
      )}
      {error && <p className="mt-3 text-center text-sm text-rose-600">{error}</p>}
    </div>
  );
}
