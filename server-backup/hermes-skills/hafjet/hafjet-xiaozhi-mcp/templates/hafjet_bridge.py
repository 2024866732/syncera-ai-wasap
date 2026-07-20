#!/usr/bin/env python3
# =============================================================================
# hafjet_bridge.py  --  XiaoZhi (official xiaozhi.me) <-> Hermes MCP bridge
# Author : Hermes-HAFJET (for Tuan Hafizi, HAFJET (M) SDN BHD)
# Phase  : 1 PoC -- proves xiaozhi.me can call a Hermes tool over MCP.
#
# ARCHITECTURE
#   [ZUOWEI device] --voice WiFi--> [xiaozhi.me OFFICIAL: ASR+LLM+Malay TTS]
#                                     --MCP WebSocket (wss://api.xiaozhi.me/mcp/?token=)
#                                              v
#                                   [Hermes MCP Bridge]  (this file; MCP SERVER role)
#                                              v  Phase1: read Hermes env (ps / state.db)
#                                   [Hermes Agent]  (NO restart, NO deploy)
#
# ROLE: we PROVIDE the tool, so this is an MCP SERVER over the websocket
# transport (websocket_client yields read/write streams -> Server.run).
# The earlier draft used ClientSession -- that is the CLIENT role and cannot
# receive tools/list from the peer. Do NOT use it here.
#
# NOTE: mcp.client.websocket.websocket_client is DEPRECATED in mcp 1.28.1 and
# slated for removal in mcp 2.0 (WebSocket is not part of the MCP spec; XiaoZhi
# uses it as an extension). Works for the PoC; if a future SDK removes it,
# switch to streamable-http transport or fallback B (mcp_pipe.py pattern).
#
# ENV VARS (Tuan sets before running; agent never writes dotfiles):
#   XIAOZHI_MCP_TOKEN   -> token; builds wss://api.xiaozhi.me/mcp/?token=...
#   (or XIAOZHI_MCP_ENDPOINT = full wss:// URL)
#   HERMES_HOME         -> ~/.hermes  (default)
#   HERMES_GATEWAY_PID  -> known gateway pid e.g. 607547 (fallback if ps fails)
#   LOG_FILE            -> /tmp/hafjet_bridge.log
#
# MCP result format (Tuan's spec): always CallToolResult-shaped; on failure
#   set isError:true (not plain text).
# =============================================================================

import asyncio
import os

from mcp import types
from mcp.server.lowlevel import Server
from mcp.server.models import InitializationOptions
from mcp.client.websocket import websocket_client

app = Server("hafjet-bridge")


def get_config():
    token = os.getenv("XIAOZHI_MCP_TOKEN", "")
    if not token:
        full = os.getenv("XIAOZHI_MCP_ENDPOINT", "")
        if full.startswith("wss://"):
            return full
        raise SystemExit("XIAOZHI_MCP_TOKEN / XIAOZHI_MCP_ENDPOINT not set")
    return f"wss://api.xiaozhi.me/mcp/?token={token}"


MCP_ENDPOINT = get_config()
HERMES_HOME = os.getenv("HERMES_HOME", os.path.expanduser("~/.hermes"))
LOG_FILE = os.getenv("LOG_FILE", "/tmp/hafjet_bridge.log")
KNOWN_GATEWAY_PID = os.getenv("HERMES_GATEWAY_PID", "607547")


def make_tool_result(text: str, is_error: bool = False) -> dict:
    """CallToolResult-shaped dict (audit-friendly: isError on failure)."""
    return {"content": [{"type": "text", "text": text}], "isError": is_error}


async def hafjet_status(arguments: dict) -> dict:
    """Read Hermes local state ONLY (ps + read-only sqlite state.db)."""
    try:
        alive = False
        try:
            import subprocess
            out = subprocess.run(
                ["ps", "-p", KNOWN_GATEWAY_PID, "-o", "etimes=", "-h"],
                capture_output=True, text=True, timeout=5,
            )
            alive = bool(out.stdout.strip())
        except Exception:
            alive = False

        session_count = 0
        try:
            import sqlite3
            db = os.path.join(HERMES_HOME, "state.db")
            if os.path.exists(db):
                con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
                cur = con.cursor()
                cur.execute("SELECT COUNT(*) FROM sessions")
                session_count = cur.fetchone()[0]
                con.close()
        except Exception:
            session_count = -1

        if alive:
            return make_tool_result(
                f"Hermes gateway sedang berjalan. {session_count} sesi aktif direkodkan."
            )
        return make_tool_result("Hermes gateway tidak dikesan berjalan.")
    except Exception as e:
        return make_tool_result(f"Ralat semasa periksa status Hermes: {e}", is_error=True)


@app.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="hafjet_status",
            description="Return HAFJET Hermes agent status (gateway + sessions).",
            inputSchema={"type": "object", "properties": {}},
        )
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> types.CallToolResult:
    if name != "hafjet_status":
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=f"Unknown tool: {name}")],
            isError=True,
        )
    result = await hafjet_status(arguments)
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=result["content"][0]["text"])],
        isError=result["isError"],
    )


async def main():
    # Requires XIAOZHI_MCP_TOKEN in env. get_config() raises if unset.
    async with websocket_client(MCP_ENDPOINT) as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="hafjet-bridge",
                server_version="1.0",
                capabilities=types.ServerCapabilities(
                    tools=types.ToolsCapability(listChanged=False)
                ),
            ),
        )


if __name__ == "__main__":
    # Connects to wss://api.xiaozhi.me/mcp/?token=... and serves hafjet_status.
    asyncio.run(main())
