# Comet / browser-AI prompt pattern (Pgybox already logged in)

Use when Tuan is on Pgybox/Oray dashboard and Hermes cannot reach X1 LAN.

## Rules for the prompt
- Read-only by default; no logout, password change, factory reset, unbind, format disk
- Goal-first: Xiaomi NAS readiness = USB volume + SMB fields, not 组网 seats
- Force structured output A–I (status, IPs, disk, share, SMB version UI, Mi Home form, blockers)
- Pre-state SN and that many Xiaomi cams need SMB1
- Ask to **report** SMB1 toggle before enabling (security tradeoff)
- Remind: camera NAS needs same LAN SMB; 组网 is secondary

## Minimum sections to demand from Comet
A. X1 online + LAN IP  
B. Disk total/used/free (~300GB+?)  
C. Share name/protocol/auth  
D. SMB version UI / SMB1 present?  
E. Exact Mi Home form strings  
F. Same-LAN check  
G. Blockers  
H. Next human clicks  
I. Chinese UI labels quoted  

Full long prompt: keep session artifacts under `~/.hermes/cache/documents/comet-*.txt` and deliver via telegram-file-delivery; do not paste multi-page prompts inline in Telegram.
