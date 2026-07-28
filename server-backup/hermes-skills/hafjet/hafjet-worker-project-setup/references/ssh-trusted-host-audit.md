# Trusted-host gate for PC Office audits

Before the first SSH audit of a worker node, do not auto-accept or persist an unknown host key.

1. Tuan runs locally on the target: `sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`.
2. Compare the supplied ED25519 fingerprint with the key presented to the controller.
3. Only after an exact match, use the explicitly confirmed audit account for read-only commands.
4. Do not create, rename, or switch to an automation account during the audit phase.

This prevents a first-connect MITM/trust-on-first-use error while preserving the no-change audit boundary.
