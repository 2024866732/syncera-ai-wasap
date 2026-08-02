---
name: grok-build
description: Use Grok Build (xAI) for headless coding tasks.
category: autonomous-ai-agents
tags: [coding, ai-agent, xai, grok, headless]
---

# Grok Build Skill

## Overview
Grok Build (`grok`) is xAI's terminal-based AI coding agent. Runs as full-screen TUI or headless CLI for code generation, file editing, shell execution, web search, and long-running tasks.

## Installation
```bash
# Prebuilt binary (recommended)
curl -fsSL https://x.ai/cli/install.sh | bash

# Binary location
/home/hafizi145/.grok/bin/grok
/home/hafizi145/.local/bin/grok  # symlink
```

## Authentication
```bash
# Device code flow (headless)
grok login --device-code
# Opens URL with user code → authorize on local machine

# Or set XAI_API_KEY env var
export XAI_API_KEY=xai-...
```

## Usage Patterns

### Headless Single Prompt
```bash
grok --single "prompt" --output-format plain
grok --single "prompt" --output-format json
grok --single "prompt" --output-format streaming-json
```

### Agent Subcommand (No TUI)
```bash
grok agent "prompt"
```

### Interactive TUI (requires TTY)
```bash
grok
grok "initial prompt"
grok --worktree=feat "create feature"
```

### Coding Tasks
```bash
# Code generation
grok --single "Create FastAPI user login endpoint" --output-format plain

# Bug fix
grok --single "Fix the bug in auth.py line 42" --output-format plain

# Refactor
grok --single "Refactor this function to use async/await" --output-format plain

# File edit
grok --single "Add error handling to main.py" --output-format plain
```

## Key Options
| Option | Description |
|--------|-------------|
| `-p, --single <PROMPT>` | Single-turn, print response & exit |
| `--output-format` | plain, json, streaming-json, streaming-messages-json |
| `--model <MODEL>` | Model ID to use |
| `--cwd <DIR>` | Working directory |
| `--allow <RULE>` | Permission allow rule |
| `--always-approve` | Auto-approve tool executions |
| `--sandbox <PROFILE>` | Sandbox profile |
| `--worktree [<NAME>]` | New git worktree |
| `--resume` | Continue recent session |

## Integration with Hermes
- Use for coding tasks that need xAI models (Grok)
- Headless mode works on this VPS
- Can be called via `terminal` tool from Hermes
- Alternative to Claude Code / Codex / OpenCode

## Example Hermes Usage
```python
from hermes_tools import terminal

result = terminal(command='grok --single "Write a Python retry decorator" --output-format plain', timeout=60)
print(result["output"])
```

## Verification
```bash
grok --version
grok --single "Test" --output-format plain
```