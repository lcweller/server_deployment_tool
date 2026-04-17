# Managing your game servers (Steamline)

This guide is for **you** after a host is online — same friendly tone as [Getting started](./getting-started.md).

![Overview](/screenshot-placeholder.png)

## Dashboard overview

- **Overview** — quick snapshot of your account.
- **Game catalog** — games you can deploy (your operator curates this list).
- **Hosts** — each **machine** running the agent.
- **Servers** — each **game instance** (one host can run several).
- **Billing** — subscription or usage (if enabled).
- **Settings** — profile, security, and **Alert settings** for email / webhooks.

## Managing a host

Open **Hosts →** pick your host.

- **Status** — **Online** means the agent has checked in recently; **Offline** means we have not heard from it (the machine may be asleep, unplugged, or blocked from the internet).
- **Hardware / telemetry** — CPU, RAM, disk, and **environment** (bare metal vs cloud, best guess provider).
- **Reboot** — asks the agent to reboot the machine when it is safe.
- **Remove host** — disconnects the machine from your account (follow prompts carefully).

## Remote terminal

The **terminal** opens a secure shell-style session **through your browser**, relayed by the dashboard to the agent. You do **not** need SSH.

- **When to use it** — quick fixes, reading files, or running a command the support team asks for.
- **When not to** — everyday game server control (use **Start / Stop** in **Servers** instead).

## Logs

- **Instance logs** — text output from installs and the game process; use filters if your UI offers them.
- **Severity** — treat **errors** as “needs attention”; **warnings** as “worth reading”; **info** as normal chatter.

## Managing game servers

Under **Servers** (or your host’s server list):

- **Deploy** — pick a catalog game and a host.
- **Start / Stop / Restart** — power actions (the agent talks to the real process).
- **Update** — refresh game files when your operator supports it.
- **Delete** — removes the instance from the dashboard and triggers cleanup on the host.
- **Connection info** — copy **IP** and **port** to share with friends (each game client is slightly different).

## Updates (host OS)

Your GameServerOS machine may be set to **automatic**, **scheduled**, or **manual** updates.

- **Automatic / scheduled** — the host tries to install **Debian security updates** during quiet windows and **skips** if game servers are running.
- **Manual** — you trigger maintenance from the dashboard when your operator exposes that control.
- **What happens to games** — updates should not run while servers are **running**; if something still goes wrong, check [Troubleshooting](./troubleshooting.md).

## Backups

Backups protect **your world files and configs**.

### Local

- Data stays **on the same machine** (fast, cheap) — if the disk dies, backups die too. Good as a **second copy** while you also use cloud backups.

### Cloud (S3-compatible)

- You need: **bucket name**, **region**, **access key**, **secret key**, and sometimes a **custom endpoint** (for MinIO, Wasabi, etc.). The dashboard walks you through each field.

### SFTP (e.g. NAS)

- For households with a NAS: enable SFTP, create a user and folder, then paste **host, port, user, password** into the dashboard.

### Scheduling, restore, retention

- **Schedule** — pick UTC times that match your quiet hours.
- **Restore** — pick a backup run and destination; the agent pulls files back (games may need to stay stopped during restore — the UI will warn you).
- **Retention** — “keep last N backups” or “keep N days” to control disk use.

**Full walkthrough:** this page is the overview; your dashboard labels match the same steps.

## Disk encryption (plain English)

**Encryption** scrambles the contents of a disk partition so someone who steals the physical drive cannot read your game files without your **passphrase**.

- **Pros** — strong protection on a physical machine in an untrusted location.
- **Cons** — you must type the passphrase after **every reboot** (for encrypted partitions).

Changing this later may require a **maintenance window** or reinstall — ask your operator if you are unsure.

## Notifications

Under **Alert settings**:

- **Email** — summaries of important events.
- **Webhooks** — send JSON to **Discord** or **Slack** incoming-webhook URLs (paste the URL, test with “Send test”).

## Multiple hosts

Repeat **Add host** (or **Link GameServerOS**) for each machine. Name hosts clearly (“EU ARK box”, “US Valheim”) so you know which is which.
