# Security and privacy

React UI/UX Tool is a local development tool. Use a trusted browser session and keep
the controller bound to `127.0.0.1`. Do not expose it through a reverse proxy or LAN
port forward. The controller gives Studio a session capability used by its API;
do not copy that token or request headers into an issue. Sessions are independent
of GitHub credentials.

## Trust boundaries

- Opening and analyzing a directory are read-only operations. Static analysis does
  not import project modules, execute configuration, run package scripts, install
  dependencies, or write instrumentation into source files.
- Preview execution requires an explicit action. The target application's code can
  perform network requests or local build-time work. Design mode intercepts element
  clicks for selection; it does not sandbox application effects on mount.
- The bundled demo uses only local, fictional data. Its Board scenarios make no
  backend requests. This promise does not extend to arbitrary user applications.
- File creation is files-only. A creation plan lists files and dependency commands.
  The generator rejects nonempty destinations and symlink targets.
- Supported visual edits write directly to source. Every write and Undo checks the
  project boundary, source identity, and content hash; a conflicting external edit
  blocks the write. Review resulting files through normal source control before push.
- Paths must remain inside the selected project. Secret-file names, excluded build
  directories, symlink escapes, and unsupported dynamic constructs are rejected or
  skipped. Do not treat ignored files as an authorization policy.
- The controller validates its session token, Host, and Origin. The preview bridge
  validates frame/origin context. Do not weaken these checks for convenience.
- No telemetry, cloud source upload, background analytics, auto-commit, automatic
  GitHub push, or deployment is part of the tool.

## Secrets and logs

Do not copy `.env`, credentials, private keys, personal customer datasets, session
URLs, or captured request headers into fixtures, screenshots, issues, or reports.
Review project scripts before choosing to run them. Use a test environment for real
apps with data-changing handlers.

## Reporting

No public security contact or repository URL has been supplied yet. Report a
suspected vulnerability privately to the project owner through an existing trusted
channel. Include affected versions and a minimal reproduction without secrets.
Do not create a public exploit report containing user source or credentials.
