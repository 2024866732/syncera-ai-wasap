---
name: oray-pgybox-sdwan
description: "Use when setting up Oray/Pgybox X-series SD-WAN."
version: 1.0.0
author: HAFJET Hermes-HAFJET
tags: [oray, pgybox, oraybox, sd-wan, nas, networking, remote-access]
platforms: [linux]
---

# Oray 蒲公英 / Pgybox / Oraybox SD-WAN (X1 class)

**Class:** consumer SD-WAN routers from Shanghai Oray (贝锐), **not** full NAS appliances.  
Manual family: `蒲公英X1使用手册` (e.g. V5.5.2). Cloud: `https://www.pgybox.com/`.

## When to use
- Tuan says “Oraybox NAS”, “蒲公英”, “Pgybox”, X1/X-series setup.
- Remote LAN mesh, USB private-cloud share, or bypass access to an existing NAS.
- Chinese PDF manual attached — extract first, then guide by mode.

## Critical product facts (X1 manual V5.5.2)
| Item | Value |
|------|--------|
| Role | SD-WAN smart router + optional USB share |
| Default LAN IP | `10.168.1.1` / `255.255.255.0` (**not** 192.168.x) |
| Default admin password | `admin` (change immediately) |
| Local wizard | `http://oraybox.com` or `http://10.168.1.1` |
| Online admin (WAN up) | `http://pgybox.oray.com` |
| Cloud account | `https://www.pgybox.com/zh/passport/login` |
| SN | Box/device back; also auto on admin page |
| USB share FS | FAT, NTFS, exFAT, Ext2/3/4 |
| Reset | Hold reset ~3s |
| Ports | 1× 10/100 Ethernet, 1× USB 2.0, USB-C power |

## Modes (ask early)

| Mode | Name | Use when |
|------|------|----------|
| **A** | 私有云 | No NAS; USB HDD/SSD on X1 → 应用中心 → 文件共享 |
| **B** | 远程访问 NAS | Existing NAS same LAN; 组网 + 旁路 |
| **C** | Traditional + 组网 | Mesh only between sites/clients |

One USB port: 4G dongle **or** storage in practice.

## HAFJET workflow
1. Extract PDF (`pdftotext` / pymupdf via `ocr-and-documents`). Confirm router, not disk NAS.
2. Ask mode **A/B/C** + physical status (power, cable, LED, internet?, NAS brand if B).
3. **Never store Oray passwords in memory/skills/checklists.** If pasted in chat: warn rotate; Tuan logs into portal themselves — agent does not automate login with live credentials.
4. Guide phased: physical → wizard → bind 贝锐 → create 组网 → mode path → harden.
5. Long detail → checklist file + `telegram-file-delivery` (`.txt` + `MEDIA:`). Chat ≤3 lines `STEP/ACTION/NEED`.
6. Azure Hermes cannot touch physical X1.

## Phases (condensed)
- **0 Physical:** power, Ethernet upstream or PC, optional USB storage.
- **1 Wizard:** DHCP client → oraybox.com / 10.168.1.1 → WAN (dynamic IP common) → Wi‑Fi → new admin pass 8–16.
- **2 Bind:** portal account → device **智能组网 → 成员列表 → 绑定帐号**.
- **3A USB cloud:** format → plug → 文件共享 + auth → client 组网 access by LAN IP.
- **3B NAS remote:** same LAN as NAS → create network → add X1 (no subnet conflict) → 旁路设置 → remote open NAS on original IP.
- **3C Mesh:** bind → network → add members → cross-ping.
- **4 Harden:** change passwords; disable 远程协助 if unused; backup; stable firmware; prefer 组网 over casual UPnP/port-forward.

## Pitfalls (session-proven)
- **`10.168.1.1` ≠ external NAS.** That is the X1 default LAN/gateway. If user answers “NAS IP?” with `10.168.1.1`, clarify X1-self vs real NAS. No second appliance → **switch Mode A** (USB share); do not force Mode B bypass.
- **“Oraybox NAS” wording** usually means X1 + USB private cloud or remote-to-NAS via 组网 — not a rack NAS SKU. State this early so mode choice is honest.
- **SN often matches portal username** (digits only). Still verify from box/admin; never treat SN as a password. Never store Oray passwords in memory/skills/checklists.
- **Guided chat gates:** one question per turn — bind OK? → 组网 created? → USB detect + 文件共享 ON? → client join + folder visible. Chat ≤3 lines `STEP/ACTION/NEED`; long detail via checklist + `telegram-file-delivery`.

## Troubleshooting
| Symptom | Check |
|---------|--------|
| No 10.168.1.1 | Same L2; DHCP; oraybox.com; PC VPN off |
| User gave 10.168.1.1 as “NAS IP” | X1 itself — ask real NAS brand/IP or switch Mode A |
| Forgot admin | Cloud factory restore or reset 3s |
| 组网 no ping | Subnet conflict; member list; restart 组网服务 |
| USB no share | FS support; data cable; enable + auth |
| Share ON but remote empty | Client not in same 组网; wrong IP (member list); share user/pass |

## Support files
- `references/x1-setup-checklist-outline.md` — BM checklist skeleton for Telegram delivery.
- `references/mode-a-remote-share-gates.md` — Mode A post-share remote access gates.

## See also
- `telegram-file-delivery` — long output as attachment.
- `ocr-and-documents` — PDF manuals.
