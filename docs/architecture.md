# Architecture and boundaries

## Components

```text
Rule planner / external AI operations JSON
                  │
                  ▼
MoonBit pure core: plan / check_apply / restore_plan
          │                    │
          ▼                    ▼
Browser compiled JS      Node host (same compiled JS)
preview and review       filesystem / journal / lock
                               │
                               ▼
                     scoped local workspace
```

`model.mbt`, `paths.mbt`, `planner.mbt`, `markdown.mbt`, and `wire.mbt` contain the data
model, portable path policy, planning, recovery decisions and serialization. The bridge
exports one JSON dispatch function. The public root package is independent of Node,
DOM, network and model providers. `.mbti` documents its exported surface.

The Node host implements actual I/O and HTTP. Browser JavaScript handles interaction
and rendering. Both use the generated `web/core.mjs`; there is no second JavaScript
implementation of planning rules. UI comparison is useful for detecting version drift;
it is not independent cryptographic verification of the compiler.

## Execution contract

1. Read the workspace into `files`, `folders`, and opaque `blocked` paths.
2. Generate a plan without modifying source files. Return issues for the whole plan.
3. At apply time, acquire the cooperative workspace lock, rebuild the plan, and compare
   the entire readable input snapshot and structure to its baseline.
4. Save original contents and the plan in a journal before any source mutation.
5. Apply sorted **net path changes**, checking each current value immediately before
   writing. A move is implemented as separate path changes, not an atomic rename group.
6. Verify affected paths, record hashes, and mark the journal committed.
7. On error, retain the journal in `needs-recovery`. Reject new transactions until the
   pending one is restored.

Journal states: `prepared → committing → committed → undoing → undone`; failures can
enter `needs-recovery`, and an interrupted restore can itself be retried.

`Plan.result.folders` preserves the baseline directory inventory; implicit new parent
directories are represented by destination file paths, not synthesized in that array.
Do not equate a physical post-apply snapshot with the whole `Plan.result` object. File
content checks use the net changes; the host removes only empty, newly introduced parent
directories during recovery.

## Recovery contract

Ordinary undo requires every affected path to equal its committed after-value. If any
affected path was edited, deleted or occupied since execution, refuse the whole restore
before changing files. Unrelated files survive. The UI does not automatically merge or
overwrite a conflict.

Interrupted recovery accepts each affected path only if it contains the original or
expected final value. A third value is a conflict. Recovery recreates text bytes and
paths, including BOM, CRLF and valid Unicode. It does not restore timestamps, ACLs,
extended attributes, owner identity or hardlink relationships. Empty directory cleanup
is conservative and never removes nonempty directories.

SHA-256 receipts are content records, **not signatures, tamper-proof audit logs, or proof
of who performed an action**. A local actor who can alter the journal can alter its
metadata. Protect journals with the same access controls as original files.

## Filesystem limits

- Single cooperative workspace; Node 22+. Only regular independent UTF-8 text files.
- Existing symlinks/junctions, hardlinks, binary files and hidden paths are rejected or
  made opaque. Metadata directory and file ancestry are checked before I/O.
- This is not an OS sandbox. Path-based checks do not close adversarial TOCTOU races
  where another process swaps ancestors between syscalls. Pause external writers.
- ASCII-style case folding and NFC host checks cover common portability hazards; the
  project does not claim full equivalence with every filesystem's Unicode collation.
- Local filesystems are the target. Network shares and cloud-synced folders are untested.
- Individual writes use a temporary file, fsync and rename. Directories are not fsynced.
  Multi-file changes are not atomically visible, and power-loss durability is not proven.
- Abrupt process death may leave a lock or temporary files; see README recovery steps.
- Read-only preview does not change source content. Opening the host's history creates
  its `.moonguard` metadata directory if missing.

Capacity: 200 text files, 200 operations, 500 known directories, 500 opaque paths,
262,144 UTF-16 units per file, 2,097,152 total. The host scans at most 1,000 entries and
treats files over 1 MiB as opaque. NUL and unpaired surrogates are not accepted.

## Markdown demonstration subset

Only root-level `.md` files with `category: engineering`, `product`, or `research` in
leading front matter are moved to `docs/<category>/<lowercase-name>`. Category parsing
is a small line-based rule, not a YAML parser. Simple inline relative link destinations
and fragments are adjusted, including relative paths from moved documents. Ordinary
fenced blocks and inline code are preserved by a deliberately limited parser.

Reference links, escaped syntax, complex/nested destinations, encoded URLs, link titles,
HTML and Obsidian wiki links are outside this version's guarantees. Do not market this
as a complete CommonMark migration engine. Review diffs before committing. Extending
this to a complete parser and exposing unsupported constructs is a next milestone.

## Local HTTP

The server binds `127.0.0.1`, accepts only the configured loopback Host, requires a
random per-process token for API access, and checks supplied Origin. The static allowlist
does not serve workspace files. A restrictive CSP disallows remote assets and framing.
These checks reduce accidental cross-site access; they do not authenticate other users
or malicious programs running locally. This host is not designed for public deployment.

The browser renders file contents as escaped text. Imported JSON is data, never shell
code. There is no generic command execution tool. Demo mutation endpoints are disabled
when started with `--workspace`.
