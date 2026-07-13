Identity: Syahrul Hafizi (MD HAFJET). X:@hafizigadjet145, GH:2024866732, Email:hafjetai@gmail.com. PASTES secrets — warn before setup.
§
Device: iPhone (Safari) — NOT desktop. Affects OAuth flows (no F12/DevTools, no localhost redirect). Need alternative auth paths like OAuth Playground for Google APIs.
§
Security: no curl|python3, no heredoc, no redirect to dotfiles. Write .py to /tmp; user edits configs via nano.
§
SECURITY SOP: NEVER use curl pipe to python3 or heredoc python — user denied with explanation. Write .py to file FIRST, then execute. NEVER write to .env via redirection — user edits manually via nano. Agent SUGGESTS values, user APPLIES.
§
Telegram iPhone: MEDIA:path FAILS — paste code as ```blocks.
§
Specs: exact JSON schemas + matching message strings (no extra periods). Wants test functions before deploy. Confirmation before UI changes. Methodical: server test → deploy → frontend.
§
GSheets accounting: 'Kewangan Hafizi Gadget' — 471 txns, OLD cols (Amaun Masuk/Keluar). GAS WebApp: AKfycbz5QuVH1RZRn190zcMHgVbrJiKWAB9CCe2LNC0rtGm_IpFZRgAuqUFdNiJiCXRk4rhkXQ. Priority: 1) deleteTransaction 2) generatePnl 3) balanceSheet/cashFlow 4) Telegram.
§
Prefers: exact output match, pre-filled 12 chart months, soft-delete not hard, LockService.waitLock for concurrent safety, default 'active' status for old rows.