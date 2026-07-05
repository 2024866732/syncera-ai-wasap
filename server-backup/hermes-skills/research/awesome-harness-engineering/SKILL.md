---
name: awesome-harness-engineering
description: >
  Curated resources, patterns, and templates for building reliable AI agent harnesses.
  Covers context delivery, tool design (MCP), planning artifacts, permissions/sandboxing,
  memory/state, verification/evals, agent loop orchestration, and observability.
  Source: https://github.com/ai-boost/awesome-harness-engineering
category: research
---

# Awesome Harness Engineering

> **Trigger:** Use this skill when working on agent harness design, tool interfaces (MCP), context compaction, permission/sandbox systems, memory architecture, verification/evals, or agent loop orchestration — for *any* AI agent framework.

## Core Principles

- **Harness engineering** is the discipline of designing scaffolding around an AI agent — context delivery, tool interfaces, planning artifacts, verification loops, memory systems, and sandboxes.
- Every harness component exists because the model can't do something yet. Document what capability improvement would make it unnecessary.
- Harness-only changes (no model swap) have been shown to move agents 20+ ranking positions on benchmarks (LangChain, deepset, 2026).

## Key Areas & Resources

### 📐 Foundations
- **[Harness Engineering](https://openai.com/index/harness-engineering/)** — OpenAI's framing of the discipline
- **[Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)** — Anthropic's agent architecture guide
- **[Unrolling the Codex Agent Loop](https://openai.com/index/unrolling-the-codex-agent-loop/)** — Detailed agent loop decomposition
- **[What makes a harness a harness](https://arxiv.org/abs/2606.10106)** — Necessary & sufficient conditions

### 🔄 Agent Loop
- ReAct pattern (Thought/Action/Observation) — foundation of all agent loops
- LangGraph for state-machine-based orchestration
- OpenAI Agents SDK / Google ADK / Anthropic Agent SDK as production references
- **Claude Code hooks** (`PreToolUse`, `PostToolUse`) for deterministic guardrails
- **State machines** constraining tool access per phase (Statewright) improve pass rate dramatically

### 🗺️ Planning & Task Decomposition
- Plan-and-Execute: separate planner LLM from executor agent
- Persistent planning artifacts: `PLAN.md`, `IMPLEMENT.md`
- Multi-agent topologies: subagents, skills, handoffs, router
- Handoffs need **typed schemas, constrained action schemas, and explicit boundary validation**
- **Subagents** process 67% fewer tokens than skills in multi-domain scenarios

### 📦 Context Delivery & Compaction
- Treat context window as finite, curated resource
- **Compaction**: server-side context summarization at limit (Anthropic: 84% token reduction)
- **Prompt caching**: cache system prompts, tool definitions, long docs
- **Autonomous compression**: agent decides when to compact (not harness-enforced at limit)
- **Token Saviour MCP**: 77% cut in active tokens via symbol-based code navigation
- **Context7 MCP**: inject version-specific library docs into context
- **Never rely on compaction for critical rules** — put them in `AGENTS.md`/`CLAUDE.md`

### 🔧 Tool Design
- Each tool: clear name, minimal schema, consistent error messages
- **MCP (Model Context Protocol)**: standardized tool integration
- Tool annotations (readOnly, destructive, idempotent, openWorld hints)
- Parallel tool calling as latency lever for deep research
- **Code-as-tool**: agent writes Python to call tools in one sandbox run (52% latency cut, 64% token reduction — Microsoft Agent Framework)
- **Tool combinations** create emergent risk ("lethal trifecta": private data + untrusted content + external communication)

### 🛡️ Permissions & Authorization
- **Beyond permission prompts** — structured authorization, not prompt-level trust
- **Claude Code Auto Mode**: two-stage classifier (fast gate → CoT reasoning only on flagged)
- **OAP (Open Agent Passport)**: deterministic pre-action authorization with cryptographic audit
- **nah**: intent-level permission mapping (not command-name matching)
- **OWASP LLM06:2025 (Excessive Agency)**: principle-of-least-privilege audit checklist

### 🧠 Memory & State
- Three-tier: core / archival / recall (Letta/MemGPT)
- Cross-session memory: mem0, Zep, engram, MemPalace
- **Facts as first-class objects** — 100% accuracy at 252× lower cost than in-context (vs. 60% fact destruction during compaction)
- Memory freshness/invalidation more important than storage — stale memories more dangerous than no memory
- Codified Context: hot-memory constitution + cold-memory KB for large codebases

### ⚙️ Orchestration & Task Runners
- LangGraph / OpenAI Agents SDK / Google ADK / AutoGen / CrewAI
- **Managed Agents** (Anthropic): decouple brain, hands, session — crash recovery via session replay
- **Symphony** (OpenAI): monitor issue tracker → isolate workspace → surface artifacts
- Parallel subagent orchestration with adversarial verification
- **Finite-state orchestration** (Conductor): YAML workflows with per-agent model overrides

### ✔️ Verification & Evals
- **promptfoo** — YAML-driven LLM regression testing in CI
- **DeepEval** — 20+ built-in metrics, pytest integration
- **Harness-Bench** — isolate execution layer effects from model effects
- **Quantifying Infrastructure Noise** (Anthropic): 6+ point swings from container resource config alone
- **Separate capability evals** (low pass rate, improvement target) from **regression evals** (near-100%, protection target)
- **AgentAssay**: behavioral fingerprinting catches 86% of regressions vs 0% with binary testing

### 👁️ Observability & Tracing
- **OpenLLMetry** — OTEL-based instrumentation for agent steps
- **Arize Phoenix** / **Langfuse** — self-hosted trace UI + eval runtime
- **Logfire** — SQL-queryable agent traces (PostgreSQL-compatible)
- **AgentPrism** — OTEL trace visualization (tree, timeline, Gantt, sequence)

### 🐛 Debugging & DX
- **claude-devtools** — reconstruct hidden session internals from local logs
- **AgentTrace** — causal graph trace analysis (69× faster than LLM-based)
- **AgentStepper** — interactive step-through debugging for agent trajectories
- **AgentOps** — session replay + cost tracking across 10+ frameworks

### 🧑‍💼 Human-in-the-Loop
- Four HITL patterns: Hook System, Tool Context, Step Functions, MCP Elicitation
- **Claude Agent SDK**: `canUseTool` callback, `AskUserQuestion`, approve-with-changes
- **HiL-Bench**: measuring when agents *should* ask for help
- **Humans on the loop** (not in/on): maintain harness, don't review individual outputs

## Templates from Repo

| Template | Purpose |
|---|---|
| `AGENTS.md` | Project-level agent instructions: conventions, constraints, tool permissions |
| `PLAN.md` | Task planning artifact with milestones and verification gates |
| `IMPLEMENT.md` | Implementation log: decisions, deviations, open questions |
| `HARNESS_CHECKLIST.md` | Review checklist before shipping a harness to production |

## Usage

Load this skill whenever you need to:
1. Design new agent tool interfaces (MCP servers, tool schemas)
2. Plan context management/compaction strategy
3. Set up permission and sandbox architecture
4. Design agent loop structure (single vs multi-agent, handoffs)
5. Build eval/verification harness for agent outputs
6. Debug agent behavior via tracing and observability

## Reference Repositories to Study

- **Claude Agent SDK** — production harness as programmable API
- **OpenHands** — three-layer harness: Runtime/Sandbox, EventStream, Agent Controller
- **SWE-agent** — Agent-Computer Interface design for domain-specific tools
- **Aider** — planner/coder split, git-aware tooling
- **smolagents** — minimal harness (~1K lines of core) to understand loop mechanics
- **mini-coding-agent** — pure-Python, stdlib-only, 6 core harness components
- **Hermes Agent** — our own platform! MCP-native, skills-based routing, session management

## Pitfalls

- ❌ Don't hard-code tool lists in system prompt — use MCP for dynamic loading
- ❌ Don't rely on compaction for critical rules — they get compressed
- ❌ Don't add more tools than needed — too many MCP servers bloat context
- ❌ Don't let agents modify their own harness config (hooks, MCP server config) — permission escalation risk
- ❌ Don't assume eval scores are model-only — harness/infrastructure effects can swing 6+ points
- ⚠️ Memory freshness > memory storage — stale memories are dangerous
- ⚠️ Tool combinations create emergent risk not visible in single-tool safety analysis
