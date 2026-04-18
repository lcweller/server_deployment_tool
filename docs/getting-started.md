# Getting started with GameServerOS

Plain-language guide for **you** — no Linux background required.

![Dashboard hosts list](/screenshot-placeholder.png)

## What is GameServerOS?

**GameServerOS** is a special version of Linux built for one job: running **game servers** that **you control from your Steamline dashboard** in the browser. You do not manage Linux day to day — the dashboard and the built-in **agent** handle updates, firewalls, and health for you.

## What you need

- A **physical PC**, **virtual machine**, or **VPS** that meets at least: **4 CPU threads**, **8 GB RAM**, and **64 GB** of free disk space (more is better for large games).
- A **wired or stable Wi‑Fi internet** connection during setup.
- A **Steamline account** (same login you use for the dashboard).

## Downloading the ISO / image

1. Log in to your Steamline dashboard.
2. Open **Hosts** (or your operator’s “provisioning” page, if provided).
3. Download the latest **GameServerOS** image your team publishes (`gameserveros-*-amd64.iso`, or a rootfs tarball if your operator uses that flow).

![Download button](/screenshot-placeholder.png)

## Creating a bootable USB drive (Windows)

You will copy the image onto a USB stick so the server can start from it.

### Option A — Rufus

1. Download **Rufus** from [https://rufus.ie](https://rufus.ie).
2. Plug in a USB drive (8 GB or larger). **Everything on that USB will be erased.**
3. Open Rufus, select your USB device, pick your GameServerOS `.iso` (or follow your team’s instructions for `.img`).
4. Use **GPT** and **UEFI** if your machine is newer; pick **MBR** / **BIOS** only if your team tells you the machine is old.
5. Click **Start**, wait until it finishes, then eject the USB safely.

### Option B — balenaEtcher (Windows)

1. Download **balenaEtcher** from [https://etcher.balena.io](https://etcher.balena.io).
2. Plug in the USB drive (**data will be erased**).
3. Choose **Flash from file**, select the GameServerOS image, select the USB, and click **Flash**.

## Creating a bootable USB drive (Mac)

1. Download **balenaEtcher** from [https://etcher.balena.io](https://etcher.balena.io).
2. Plug in the USB (**it will be erased**).
3. **Flash from file** → pick the GameServerOS image → select the USB → **Flash**.

## Installing on a physical server (bare metal)

1. Plug the USB into the server.
2. Turn the server on and open the **boot menu** — usually **F12**, **F11**, **F10**, **Esc**, **F2**, or **Delete** right after power-on. The screen may show a hint for one or two seconds.
3. Pick the USB drive from the list.
4. Follow the **on-screen installer** (welcome → internet check → pairing code → name & options → progress → reboot).

## Installing on a VPS (examples)

### Hetzner (Robot / Cloud)

1. Order a server and open the **Rescue** or **ISO** mount option.
2. Upload or select the GameServerOS image, boot once, complete the installer, then switch back to **local disk** boot if your flow requires it (follow your operator checklist).

### OVH

1. In the **OVHcloud Control Panel**, open your instance → **Boot** → mount **from a `.iso`** when offered.
2. Reboot, complete the installer, then detach the ISO per OVH’s steps.

### Vultr

1. **Deploy** → choose **Upload ISO** (if your account supports custom ISOs).
2. Deploy the instance from that ISO, run the installer, then set the boot device back to disk.

For other providers, search their docs for **“custom ISO”** or **“rescue ISO”** — the idea is always: **boot the GameServerOS media once**, run the installer, then boot from the installed disk.

## Installing in a virtual machine

### VirtualBox

1. **New** → type **Linux**, version **Debian (64-bit)**.
2. RAM: **4096 MB** minimum (8192 MB recommended), CPUs: **2+**, disk: **64 GB** dynamic.
3. **Settings → Storage**: mount the GameServerOS ISO as the virtual CD.
4. Start the VM and follow the installer.

### Proxmox

1. **Create VM** → **OS** tab: select your uploaded ISO.
2. Give **4+ cores**, **8 GB RAM**, **VirtIO SCSI** disk **64 GB+**.
3. Start the VM, open **Console**, follow the installer.

## Walking through the installer

1. **Welcome** — what GameServerOS will do for you.
2. **Internet** — must be online; retry or simple DHCP refresh if needed.
3. **Pairing code** — a short code appears **on the server**. On your **phone or laptop**, open the dashboard → **Hosts** → **Link GameServerOS**, type the code and a name.
4. **Options** — time zone, encryption choice, update policy.
5. **Progress** — partitioning (when enabled), packages, security hardening, agent install.
6. **Done** — reboot; your host should show **online** in the dashboard.

## Deploying your first game server

1. Open **Servers** (or **Hosts → your host → Deploy**).
2. Pick a **game** from the catalog.
3. Click **Deploy** / **Start** and wait until status is **Running**.
4. Copy the **IP address and port** from the dashboard into your game client’s **Favorites / Direct connect** (wording depends on the game).

## You’re done!

You now have a managed host. For day‑to‑day tasks, open the **[Management guide](./management.md)**.
