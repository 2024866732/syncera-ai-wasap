# Mode A — USB private cloud remote gates

Use after physical USB detect + 文件共享 ON.

## Order (one gate per chat turn)
1. **USB detect + share ON** — 应用中心 → 文件共享 enabled; prefer share username/password.
2. **组网 exists + X1 member** — portal 创建网络 → 从未组网添加 SN; no subnet conflict with peers.
3. **Client join** — phone/PC app 蒲公英, same Oray account, join that network.
4. **Open share** — use X1 IP from **成员列表** (often still `10.168.1.1` on device LAN side; do not invent). SMB/FTP per UI.
5. **Harden** — rotate portal + router admin if leaked in chat; disable 远程协助 if unused; backup config.

## Common misroutes
- User started Mode B then only has USB → switch A; do not ask for external NAS forever.
- `10.168.1.1` as “NAS IP” answer = X1 self (OK for Mode A share host, wrong for Mode B target appliance).
- Share ON locally but remote empty → client not joined / wrong network / missing share auth.

## Agent limits
Azure Hermes cannot mount the USB or join 组网 as a peer. Coach + verify via Tuan screenshots/status only.
