# Security Responsibilities

## OS-level protections (Steamline / GameServerOS agent)

- **nftables (preferred):** Default-deny inbound `filter` table `inet steamline`; loopback + established/related allowed; agent TCP ports (`STEAMLINE_AGENT_ALLOW_TCP_PORTS`); game TCP/UDP ports only for instances in **running/recovering** state. Inbound rate limits on game ports reduce volumetric abuse (global limits; not a substitute for edge scrubbing). Reconciliation loop re-applies intent if rules drift.
- **firewalld (fallback):** When `nft` is unavailable but `firewall-cmd` exists (many generic Linux installs), the agent adds/removes permanent port opens to match the same logical port set. Default zone policy is **not** rewritten to full default-deny; use nftables on hardened appliances.
- **Sysctl:** `config/sysctl/99-gameserveros-hardening.conf` — copied to `/etc/sysctl.d/` on startup (root). SYN cookies, rp_filter, redirects, forwarding, ASLR, suid dumps, conntrack tuning.
- **AppArmor:** `config/apparmor/steamline-agent` (unrestricted management profile) and `steamline-gameserver` (confined game workload) — loaded when `apparmor_parser` is present. Dedicated binaries can be wrapped with `aa-exec` to apply `steamline-gameserver` where supported.
- **Integrity monitor:** Baseline hashes for deployed sysctl/AppArmor copies under `/etc` (see `agent/integrity-monitor.ts`).

## Upstream / operator

- **Volumetric DDoS, SYN floods beyond host CPU, and large botnets:** Mitigate at **router, hosting anti-DDoS, Cloudflare Spectrum / CDN, or ISP** — the host only sees traffic that already reached the NIC.
- **Management exposure:** Restrict dashboard/agent ports at the cloud security group if possible.
- **Secrets:** Dashboard sessions, backup credentials, webhooks, and email API keys are user/operator responsibility.
