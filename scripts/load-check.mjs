// Preliminary staging health-load check, not a production capacity certification.
import { performance } from "node:perf_hooks";
const base = new URL(process.argv[2] || "http://127.0.0.1:8000");
if (
  base.username ||
  base.password ||
  !["http:", "https:"].includes(base.protocol)
)
  throw Error("Use a plain HTTP(S) staging origin without credentials.");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) &&
  process.env.ALLOW_REMOTE_LOAD_CHECK !== "yes"
)
  throw Error(
    "Remote load testing requires ALLOW_REMOTE_LOAD_CHECK=yes and authorization for that staging host.",
  );
const concurrency = Math.min(
    50,
    Math.max(1, Number(process.env.LOAD_CONCURRENCY) || 10),
  ),
  seconds = Math.min(60, Math.max(1, Number(process.env.LOAD_SECONDS) || 10));
const until = performance.now() + seconds * 1000,
  latencies = [];
let failed = 0,
  total = 0;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (performance.now() < until) {
      const start = performance.now();
      try {
        const response = await fetch(new URL("/api/health", base), {
          signal: AbortSignal.timeout(5000),
        });
        const data = await response.json();
        if (!response.ok || data.ok !== true) failed++;
      } catch {
        failed++;
      }
      total++;
      if (latencies.length < 100000) latencies.push(performance.now() - start);
    }
  }),
);
latencies.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      concurrency,
      seconds,
      requests: total,
      failed,
      p50Ms: Math.round(latencies[Math.floor(latencies.length * 0.5)] || 0),
      p95Ms: Math.round(latencies[Math.floor(latencies.length * 0.95)] || 0),
      scope:
        "health endpoint only; not a biometric or full-workload capacity result",
    },
    null,
    2,
  ),
);
if (failed) process.exitCode = 1;
