# Troubleshooting — stay calm, we’ll walk through it

If something looks wrong, try the steps in order. **You are not expected to read Linux logs** — the dashboard and support team can see more detail on their side.

## My host shows as offline

1. Is the machine **powered on** and plugged into **power and network**?
2. If it is a home PC, did **Windows Update** or a router reboot change anything? Reboot the PC once.
3. Wait **two minutes** — status updates after the agent checks in.
4. Still offline? Open **[Management](./management.md)** → remote terminal (if it still connects) or contact support with your **host name** and **approximate time** the issue started.

## The installer says there is no internet

1. Check the **Ethernet cable** clicks in on both ends (or reconnect Wi‑Fi if that is how you set it up).
2. Reboot the **router** once, wait until phones or laptops online again, then use **Retry** on the installer.
3. If your network needs a **static IP**, ask your ISP or IT person for the four numbers (IP, mask, gateway, DNS) before choosing **Manual** in the installer.

## My pairing code is not working

1. Codes **expire** — on the server screen, choose **retry** to get a new code if offered.
2. On the dashboard, use **Hosts → Link GameServerOS** and type the code **exactly** as shown (letters and numbers only, with the **dash** in the middle).
3. Make sure you are logging into the **same Steamline account** you intend to use.

## My game server will not start

1. Open the instance in the dashboard and read the **last message** — it is written in plain language when we know the cause.
2. Press **Stop**, wait ten seconds, then **Start** once.
3. If it mentions **Steam credentials** or **firewall**, follow the host cards for **Steam** and **Linux root access** (if shown).

## My game server runs but I cannot connect

1. Confirm you are using the **public IP** and **game port** from the dashboard (not the RCON port unless the game uses it).
2. On home internet, your router may need **port forwarding** — the agent tries **UPnP** when possible; otherwise add a manual forward for the **game port** to this machine.
3. Try joining from a **different network** (mobile hotspot) to rule out router hairpin issues.

## My backup failed

1. Open **Backups → history** and read the short error line.
2. For **S3**, re-check **bucket, region, keys**; try **Test connection** if available.
3. For **local** paths, pick a folder on a disk with **free space**.

## My host ran out of disk space

1. Remove old games or worlds you no longer need (after backing up!).
2. In **Hosts**, check **disk usage** — if it is above **90%**, free space soon; above **95%** is urgent.
3. Run **Backups** to move large archives to **cloud** storage, then delete old local copies if safe.

## The dashboard shows an error I do not understand

1. Refresh the page once.
2. Try **another browser** or a private window (extensions sometimes block cookies).
3. Contact support with **what you clicked** and **what you expected** — a screenshot helps.

## I forgot my encryption passphrase

There is **no recovery** without the passphrase — that is how encryption protects you. Restore from a **backup** onto a new install, or reinstall GameServerOS and accept data loss on encrypted volumes. **Write passphrases down** and store them somewhere safe.

## I need to reinstall GameServerOS

1. Back up worlds first (see **Backups**).
2. Download the latest image from your operator.
3. Re-run the installer; use **Link GameServerOS** again with the new pairing code.

## Contact support

Email or ticket channel your operator publishes — include **host name**, **time**, and what you already tried from this page.
