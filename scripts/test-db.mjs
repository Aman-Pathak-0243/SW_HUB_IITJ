// Local live-DB test runner (Session 13). Runs every live suite (the `*.db.test.mjs` /
// `db.smoke` files — discovered as those that self-skip on RUN_DB_TESTS) PER-FILE, each
// in its own single-fork vitest process, against whatever DATABASE_URL is loaded (use
// `.env.test` → the Docker Postgres in docker-compose.yml).
//
// WHY per-file: the live suites assert ABSOLUTE audit-row counts and the year.db suite
// mutates the shared current-year row, so running them all in ONE process lets earlier
// suites' rows bleed into a later suite's count assertion (KNOWN_ISSUES #39). Per-file
// gives each suite a clean assertion. Against local Postgres this whole loop is seconds.
//
//   npm run db:local:up && npm run db:local:setup && npm run test:db
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const TESTS_DIR = path.resolve("tests");
const files = readdirSync(TESTS_DIR)
  .filter((f) => f.endsWith(".test.mjs"))
  .filter((f) => readFileSync(path.join(TESTS_DIR, f), "utf8").includes("RUN_DB_TESTS"))
  .sort();

if (!files.length) {
  console.error("No live-DB suites found (files referencing RUN_DB_TESTS).");
  process.exit(1);
}
console.log(`Running ${files.length} live-DB suites PER-FILE (single-fork) against ${process.env.DATABASE_URL?.split("@")[1] ?? "the configured DB"}\n`);

const vitest = path.resolve("node_modules/.bin/vitest");
const results = [];
for (const f of files) {
  const started = Date.now();
  const r = spawnSync(vitest, ["run", `tests/${f}`, "--pool=forks", "--poolOptions.forks.singleFork"], {
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, RUN_DB_TESTS: "1" },
  });
  results.push({ f, ok: r.status === 0, ms: Date.now() - started });
}

console.log("\n" + "=".repeat(60));
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.f.padEnd(30)} ${(r.ms / 1000).toFixed(1)}s`);
const failed = results.filter((r) => !r.ok);
console.log("=".repeat(60));
console.log(`${results.length} suites · ${results.length - failed.length} ok · ${failed.length} failed`);
if (failed.length) {
  console.log("FAILED: " + failed.map((r) => r.f).join(", "));
  process.exit(1);
}
console.log("All live-DB suites green. ✓");
