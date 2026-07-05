# Context7 CLI Pitfalls (Session-tested)

- `ctx7 docs` takes exactly 2 args: `libraryId` and single `query`. Extra keywords fail with `too many arguments for 'docs'. Expected 2 arguments but got 3`.
- Some doc queries are falsely flagged as long-lived processes and blocked. Workaround: simpler query wording, or use `web_search`/`web_extract` instead.
- Library resolution is limited to 3 calls per question; stop and use the best match after that.
