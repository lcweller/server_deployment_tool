# Docker-Mailserver + Steamline (Unraid)

Steamline only **sends** mail (verification links). [Docker-Mailserver](https://github.com/docker-mailserver/docker-mailserver) (DMS) gives you SMTP with authenticated submission on **port 587**.

## Before you start

1. **Domain** you control (e.g. `example.com`).
2. **DNS**
   - **`A` record** for your mail host, e.g. `mail.example.com` → your Unraid/public IP (same IP that will reach the internet on port 25 if you receive mail later).
   - For **verification mail to be delivered** to Gmail/iCloud/etc., you will eventually want **SPF**, **DKIM** (DMS can generate DKIM), and often **DMARC**. That is a larger topic; start with a working SMTP login first.
3. **Firewall** on Unraid/router: forward **587** (and **25** if you need inbound mail) to the host running DMS.

## 1. Run Docker-Mailserver

Use the [official `compose.yaml`](https://github.com/docker-mailserver/docker-mailserver/blob/master/compose.yaml) as a base. Minimal example:

```yaml
services:
  mailserver:
    image: ghcr.io/docker-mailserver/docker-mailserver:latest
    container_name: mailserver
    hostname: mail.example.com
    env_file: mailserver.env
    ports:
      - "25:25"
      - "143:143"
      - "465:465"
      - "587:587"
      - "993:993"
    volumes:
      - ./docker-data/dms/mail-data/:/var/mail/
      - ./docker-data/dms/mail-state/:/var/mail-state/
      - "./docker-data/dms/mail-logs/:/var/log/mail/"
      - ./docker-data/dms/config/:/tmp/docker-mailserver/
      - /etc/localtime:/etc/localtime:ro
    restart: always
    stop_grace_period: 1m
```

Copy `mailserver.env` from the [project](https://github.com/docker-mailserver/docker-mailserver/blob/master/mailserver.env) and adjust. Common settings:

- Leave **`OVERRIDE_HOSTNAME`** empty if `hostname: mail.example.com` in compose is correct (see DMS docs).
- **`PERMIT_DOCKER`**: If other containers send mail **without** auth (not recommended), DMS has options for trusted Docker networks. For Steamline you will use **587 + username/password**, so strict `PERMIT_DOCKER` is less critical; still follow [DMS networking docs](https://docker-mailserver.github.io/docker-mailserver/latest/config/environment/#permit_docker).

Start:

```bash
docker compose pull
docker compose up -d
```

Watch logs until the container is healthy.

## 2. Create a mailbox for Steamline

From the folder that contains DMS’s `setup.sh` (see [DMS setup](https://docker-mailserver.github.io/docker-mailserver/latest/config/setup.sh/)):

```bash
./setup.sh email add noreply@example.com 'YourStrongPassword'
```

Use a dedicated address (e.g. `noreply@example.com`) as the **From** address for Steamline.

Optional: generate DKIM and add DNS records when DMS prints instructions (improves deliverability).

## 3. Put Steamline and DMS on the same Docker network (recommended)

Create a user-defined bridge network and attach **both** stacks:

```bash
docker network create steamline-net
```

- In **Steamline** `docker-compose.stack.yml`, add:

  ```yaml
  networks:
    default:
      name: steamline-net
      external: true
  ```

- In the **mailserver** compose, add the same `networks` block so `mailserver` joins `steamline-net`.

Then Steamline can use **`SMTP_HOST=mailserver`** (the DMS `container_name`) and port **587**.

If you **cannot** use a shared network, set `SMTP_HOST` to your **Unraid LAN IP** and keep port **587** published on the host (as in the compose `ports`).

## 4. Configure the Steamline container

Set these **environment variables** on the Steamline app (not Postgres):

| Variable | Example | Notes |
|----------|---------|--------|
| `SMTP_HOST` | `mailserver` | DMS container name on the same Docker network, or Unraid IP |
| `SMTP_PORT` | `587` | Submission with STARTTLS (matches Steamline’s nodemailer defaults) |
| `SMTP_USER` | `noreply@example.com` | Full mailbox address |
| `SMTP_PASS` | `(password)` | From `./setup.sh email add …` |
| `SMTP_FROM` | `Steamline <noreply@example.com>` | Should match an existing mailbox/domain on DMS |
| `APP_PUBLIC_URL` | `https://steamline.example.com` | No trailing slash; used in email links |

Restart Steamline after saving.

## 5. Verify

1. Register a test user in Steamline.
2. Check DMS logs for the outbound message.
3. If the message never arrives, check spam, then SPF/DKIM/DMARC and whether port 25 outbound from your ISP is blocked (common on residential connections).

## Troubleshooting

- **`ECONNECTION` / timeout**: Wrong `SMTP_HOST`, firewall blocking 587, or containers not on the same network.
- **Authentication failed**: Wrong `SMTP_USER` / `SMTP_PASS`, or account not created in DMS.
- **Deliverability** (received but spam): Add DKIM DNS records from DMS, align SPF, use a proper `SMTP_FROM` domain.
- **Residential IP**: Many ISPs block outbound 25; DMS may still send on 587 from the client—receiving providers may still flag mail without rDNS/SPF. For serious production, a transactional provider (Resend, SendGrid, SES) is often simpler than self-hosting SMTP.

## Reference: Steamline defaults (from code)

If `SMTP_*` is unset, Steamline defaults to `localhost:1025` (Mailpit for local dev)—not suitable for Unraid unless you intentionally run Mailpit.
