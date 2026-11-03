# Local benchmark notes

These are development-host observations for the bundled five-source-file demo. They
are not universal performance guarantees or p95 results. Run `npm run benchmark` to
measure the current checkout. The script starts the protected loopback controller,
analyzes `fixtures/demo`, samples process RSS, and closes the controller.

Recorded 30 October 2026 on macOS Apple Silicon, Node 24.22.1:

| Measurement | Result |
| --- | ---: |
| Controller startup after module load | 7.9 ms |
| Demo static analysis, including lazy engine import | 358.4 ms |
| Files / JSX nodes | 5 / 91 |
| Idle RSS after GC | 68.3 MiB |
| Observed analysis peak / settled RSS | 206.3 / 199.2 MiB |

The benchmark process loads TypeScript and the server engine before timing controller
startup. It therefore measures a warm in-process controller start, not package import
or npm startup. RSS sampling is best-effort and can miss very short allocation peaks.
