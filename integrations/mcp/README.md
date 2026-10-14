# MoonGuard MCP adapter

An optional stdio server using the official TypeScript SDK (JavaScript runtime).
Planning and validation still use the project's compiled MoonBit core. This adapter
adds no dependencies to the root library or to the ordinary `npm start` demo.

## Install and try

From the repository root:

```sh
npm ci --prefix integrations/mcp --ignore-scripts
node integrations/mcp/demo-client.mjs --port 4318
```

The example is a **separate official-SDK MCP client**, not an LLM. It starts the stdio
server, initializes the protocol, submits the deterministic organizer's proposal, and
prints a local `reviewUrl`. Open it to inspect, execute, decline or restore. The client
prints changed status as you act. Ctrl+C stops the example and its child process.
It creates only isolated sample files. Keep port 4318 free, or omit `--port` for a
random loopback port. An already running server on 4317 is a separate session.

For an external MCP application, copy `mcp-config.example.json`, replace the absolute
path, and register that file using the client's documented MCP settings. On Windows,
use a Node executable on PATH and forward-slash absolute paths such as
`D:/Codex/MoonGuard/outputs/moonguard/integrations/mcp/server.mjs`. No settings are
automatically installed or modified by this repository.

The example configuration uses isolated demo files. Only add
`"--workspace", "/absolute/path/to/document-copy"` after choosing a specific document
copy to share with the external client. `moonguard_read_file` returns content to that
client, which may send it to its model provider. This differs from the standalone
local demo, which does not upload file content.

## Tools

| Tool | Input | Result |
| --- | --- | --- |
| `moonguard_workspace` | `{}` | Readable paths/sizes and review URL, no file contents |
| `moonguard_read_file` | `path` | One supported text file |
| `moonguard_propose` | optional `title`, `operations` | ID, issues, changed paths, review URL |
| `moonguard_status` | `id` | awaiting_review / committed / declined / rejected / restored etc. |

Operation fields follow the root README; unused fields must be omitted in MCP input.
The typed schema rejects unsupported operations. The MoonBit core checks actual path
rules, collisions, snapshots and restoration. The JSON schema does not replace it.

There is no MCP apply, restore, token-reading or shell-execution tool. The local page
receives incoming proposals automatically and requires a UI action to execute them.
The adapter does **not** sandbox an external Agent which already has separate shell or
browser permissions; such a client can bypass this workflow using its other tools.

Every new proposal supersedes the previous one, including a proposal made by the local
UI. Approval is bound to the exact opaque ID. Stale IDs cannot apply. Last 32 proposal
statuses are held in process memory; restart or demo reset expires them. Execution
journals are still durable and can be recovered in the local UI or CLI. Do not poll
rapidly or resubmit proposals while someone is reviewing.

Example task prompt for an authorized demo session:

> Use MoonGuard to list this demo workspace, propose organizing the Markdown files,
> and show me the review URL and affected paths. Wait for me to inspect the page.
> Query proposal status afterward; do not use other tools to execute the plan.

## OpenSeek compatibility status

OpenSeek's upstream `mcp/config/config.mbt` accepts the standard
`{"mcpServers":{"name":{"command":"node","args":[...]}}}` structure. Its
`internal/openseek/commands/mcp.mbt` provides `openseek mcp --mcp-config <file>` for
tool discovery. These source files were inspected on 2026-10-14.

Configuration example: `openseek mcp --mcp-config /path/to/mcp-config.json`.
OpenSeek itself has **not** been built or run in this project validation, and no actual
LLM session has been claimed. The tested compatibility baseline is the official MCP
SDK client over a real stdio child process, on both the workflow's supported platforms
when their CI runs pass. A successful OpenSeek run should be recorded separately.

Primary references:
- https://github.com/modelcontextprotocol/typescript-sdk
- https://github.com/moonbitlang/openseek/blob/main/mcp/config/config.mbt
- https://github.com/moonbitlang/openseek/blob/main/internal/openseek/commands/mcp.mbt

## Reproduce protocol tests

```sh
npm run test:mcp
```

Tests launch a real server process, perform initialize/listTools/callTool, exercise
browser-equivalent HTTP approval, verify bytes on disk, and query final status. They
test decline, stale proposals, supersession, malformed input and traversal. This is
protocol and file-operation evidence, not evidence of model intelligence or user value.
