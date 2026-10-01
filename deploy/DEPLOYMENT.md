# Deploying to collectmytranscriptmsu.com

Target: **AlmaLinux 9**, VPS Spark, `198.54.112.154`, 1 GB RAM / 1 vCPU,
self-managed.

Everything runs on this one server:

```text
                    internet
                       |
                   nginx :80/:443          TLS terminates here
                    /          \
        /api/  /django-admin/   everything else
              |                      |
     gunicorn 127.0.0.1:8000   node  127.0.0.1:3000
       (Django API)              (frontend SSR)
              |
      PostgreSQL 127.0.0.1:5432
```

The frontend and the API share one origin, so the browser never makes a
cross-origin request and **no CORS configuration is needed**. Only nginx is
exposed; PostgreSQL, gunicorn and Node all bind to loopback and the firewall
keeps their ports closed.

---

## Before you start

You need:

- **root SSH access** to `198.54.112.154`
- **control of the domain's DNS** at your registrar
- an **email address** for the Let's Encrypt certificate

> **Your DNS is not pointed here yet.** As of writing,
> `collectmytranscriptmsu.com` resolves to `162.255.119.47` and `www` to a
> Namecheap parking host. Step 2 fixes that. HTTPS cannot be issued until it has
> propagated.

---

## Step 1 — Upload the code

A ready-made archive is built for you at the project root: **`msu-deploy.tar.gz`**
(about 114 KB). It contains `Backend/`, `Frontend/`, `deploy/` and `README.md`,
and deliberately excludes:

- `node_modules/`, `venv/`, `.output/`, `dist/` — platform-specific, rebuilt on
  the server
- **both local `.env` files** — so your development `DEBUG=True` can never reach
  production

Upload it with the **SFTP** tab of your SSH client (or `scp`) to `/root/`:

```sh
# from your local machine, if you prefer the command line
scp msu-deploy.tar.gz root@198.54.112.154:/root/
```

To rebuild the archive after code changes, from the project root:

```sh
tar --exclude='Frontend/node_modules' --exclude='Frontend/.output' \
    --exclude='Frontend/dist' --exclude='Frontend/.tanstack' \
    --exclude='Frontend/.env' --exclude='Backend/venv' \
    --exclude='Backend/.ruff_cache' --exclude='Backend/staticfiles' \
    --exclude='Backend/.env' --exclude='msu-deploy.tar.gz' \
    -czf msu-deploy.tar.gz Backend Frontend deploy README.md
```

Then unpack it on the **server**:

```sh
mkdir -p /srv/msu
tar -xzf /root/msu-deploy.tar.gz -C /srv/msu
ls /srv/msu          # Backend  Frontend  deploy  README.md
```

---

## Step 2 — Bootstrap the server

```sh
bash /srv/msu/deploy/setup-server.sh
```

This installs nginx, Python 3.12, Node 20, PostgreSQL, firewalld and fail2ban;
creates a **2 GB swap file** (your VPS has only 17 MB of swap and 1 GB of RAM —
the frontend build gets OOM-killed without it); creates the `msu` service user;
creates the database and role; opens only HTTP/HTTPS/SSH; and sets the SELinux
flag nginx needs to reach local services.

It takes a few minutes and is safe to re-run.

> **Copy the generated database password from the output.** It is printed once
> and stored nowhere else. You need it in step 4.

Python 3.12 is not optional: Django 6 requires it, and AlmaLinux 9's default
`python3` is 3.9. The script stops with a clear message if it isn't available.

---

## Step 3 — Point DNS at the server

At your registrar (Namecheap), replace the parking records with:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | `198.54.112.154` | Automatic |
| A | `www` | `198.54.112.154` | Automatic |

Delete any existing `CNAME` / `URL Redirect` / parking records for `@` and `www`,
or they will conflict. (Your parking records have already been removed; the A
records above still need adding.)

Namecheap path: **Domain List → Manage → Advanced DNS → Host Records**.

Wait for propagation — usually minutes on Namecheap BasicDNS, up to an hour —
then confirm from your machine:

```sh
nslookup collectmytranscriptmsu.com 8.8.8.8
# Address: 198.54.112.154
```

Do not continue to the certificate step (step 7) until this returns the right IP.
Steps 4–6 can be done while DNS propagates: nginx is configured to answer on the
IP address too, so you can verify the whole deployment at
`http://198.54.112.154` first.

---

## Step 4 — Configure the environment

**Backend:**

```sh
cp /srv/msu/deploy/env-templates/backend.env.production /srv/msu/Backend/.env
chown msu:msu /srv/msu/Backend/.env
chmod 600 /srv/msu/Backend/.env
```

Two values need filling in: `SECRET_KEY` and `POSTGRES_PASSWORD`.

The reliable way is to let the shell do it — no editor, no hand-copying a
64-character secret, and no shell-quoting mistakes:

```sh
DBPASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
sudo -u postgres psql -c "ALTER ROLE msu_transcripts WITH PASSWORD '$DBPASS';"

SECRET=$(python3.12 -c "import secrets; print(secrets.token_urlsafe(64))")

SECRET="$SECRET" DBPASS="$DBPASS" python3.12 - <<'PY'
import os, pathlib
path = pathlib.Path("/srv/msu/Backend/.env")
replacements = {
    "SECRET_KEY=": os.environ["SECRET"],
    "POSTGRES_PASSWORD=": os.environ["DBPASS"],
}
lines = []
for line in path.read_text().splitlines():
    for key, value in replacements.items():
        if line.startswith(key):
            line = key + value
    lines.append(line)
path.write_text("\n".join(lines) + "\n")
print("SECRET_KEY and POSTGRES_PASSWORD written")
PY
```

This also re-sets the database role password, so the two can't drift apart.

To edit by hand instead, use `nano /srv/msu/Backend/.env` (`setup-server.sh`
installs nano; the stock AlmaLinux image has only `vi`) and set:

- `SECRET_KEY` — any long random string
- `POSTGRES_PASSWORD` — must match the database role's password

Everything else is already correct for this domain — `ALLOWED_HOSTS`,
`CSRF_TRUSTED_ORIGINS`, the empty `CORS_ALLOWED_ORIGINS` and the database
settings are pre-filled.

> Keep the `SECRET_KEY` to yourself: it signs the JWTs and session cookies.
> Never paste it into a chat, an issue, or a commit. It only ever needs to exist
> in this one file. If it is ever exposed, replace it and restart
> `msu-backend` — that invalidates existing sessions but nothing else.

Django **refuses to start** with `DEBUG=False` and no `SECRET_KEY`, so a missed
step fails loudly rather than silently running insecure.

**Frontend:**

```sh
cp /srv/msu/deploy/env-templates/frontend.env.production /srv/msu/Frontend/.env
chown msu:msu /srv/msu/Frontend/.env
```

No edits needed. It sets `VITE_API_URL="/api"` — a relative path, so the app
talks to whatever host served it.

> `VITE_*` values are compiled into the JavaScript at build time. Editing this
> file later has no effect until you re-run `deploy.sh`.

---

## Step 5 — Deploy

```sh
sudo bash /srv/msu/deploy/deploy.sh
```

This installs dependencies, runs migrations, collects the Django admin's static
files, builds the frontend, installs and restarts both systemd services, and
then checks that each one answers. It is the same command you use for every
future update.

Expected tail:

```text
==> Verifying
    ok   backend (gunicorn)           200
    ok   backend admin-gated          401
    ok   frontend (node ssr)          200
==> Deploy complete
```

The `401` is correct — it proves the admin endpoint rejects unauthenticated
requests.

---

## Step 6 — Configure nginx

```sh
cp /srv/msu/deploy/nginx/collectmytranscriptmsu.com.conf /etc/nginx/conf.d/
nginx -t                     # must report "syntax is ok"
systemctl reload nginx
```

Visit `http://collectmytranscriptmsu.com` — the site should load over plain
HTTP. Fix any problem here before adding TLS.

---

## Step 7 — Enable HTTPS

Only once DNS resolves to this server:

```sh
dnf -y install certbot python3-certbot-nginx
mkdir -p /var/www/certbot

certbot --nginx \
    -d collectmytranscriptmsu.com \
    -d www.collectmytranscriptmsu.com \
    --agree-tos --redirect -m you@example.com
```

Replace `you@example.com` with a real address — it receives expiry warnings.

certbot edits the nginx config in place: it adds the `443` block, the
certificate paths, and the HTTP→HTTPS redirect. Renewal is automatic via a
systemd timer; confirm it:

```sh
systemctl list-timers | grep certbot
certbot renew --dry-run
```

Then visit `https://collectmytranscriptmsu.com`.

---

## Step 8 — Create the administrator account

There is no public sign-up. Create the administrator on the server:

```sh
cd /srv/msu/Backend
sudo -u msu ./venv/bin/python manage.py make_admin you@example.com --password 'a-strong-password'
```

Run it again with another email to add more staff. The sign-in page has a
**Forgot password?** link; for it to send real emails, set the `EMAIL_*` values
and `FRONTEND_URL` in `Backend/.env` (see `env-templates/backend.env.production`).
Without them, reset emails are only written to the service log.

Then walk through the flow once to confirm everything works: add a Zimpost
branch, submit a request from a private window, look it up on `/status`, and
confirm it appears in `/admin`.

---

## Day-to-day operations

### Deploy an update

```sh
cd /srv/msu && git pull        # or re-copy the files
sudo bash /srv/msu/deploy/deploy.sh
```

### Service control

```sh
systemctl status  msu-backend msu-frontend
systemctl restart msu-backend
journalctl -u msu-backend  -f
journalctl -u msu-frontend -f
tail -f /var/log/nginx/msu-error.log
```

### Grant admin to another user

```sh
# Once, to get a Django admin login:
cd /srv/msu/Backend
sudo -u msu venv/bin/python manage.py createsuperuser
```

Then at `https://collectmytranscriptmsu.com/django-admin/` → **User roles** →
**Add**, pick the user and the `admin` role.

### Database backup

```sh
sudo -u postgres pg_dump msu_transcripts | gzip > /root/msu-$(date +%F).sql.gz
```

Worth putting in a cron job, with the copies stored off the server.

### Run the test suite on the server

```sh
cd /srv/msu/Backend
sudo -u msu venv/bin/python manage.py test tests
```

---

## Troubleshooting

**502 Bad Gateway on every page.**
Either an app service is down or SELinux is blocking nginx.

```sh
systemctl status msu-backend msu-frontend
getsebool httpd_can_network_connect          # must be "on"
setsebool -P httpd_can_network_connect 1     # if it is off
```

**`msu-frontend` won't start; journal says it cannot find `index.mjs`.**
The build produced the wrong shape. It must be `npm run build:server`, not
`npm run build`. Re-run `deploy.sh`.

**Frontend build is killed part-way with no error.**
Out of memory. Confirm swap is active with `free -h`; if the `Swap` row is all
zeros, re-run `setup-server.sh`.

**`ImproperlyConfigured: SECRET_KEY must be set`.**
`Backend/.env` is missing the key, or systemd can't read the file. Check
`ls -l /srv/msu/Backend/.env` shows owner `msu`.

**Django admin loads with no styling.**
`collectstatic` hasn't run, or nginx can't read the output.

```sh
ls /srv/msu/Backend/staticfiles/admin/css/    # should list files
```

**`DisallowedHost` in the backend log.**
The hostname used isn't in `ALLOWED_HOSTS` in `Backend/.env`. Add it and
`systemctl restart msu-backend`.

**API calls 404 or hit the wrong service.**
`VITE_API_URL` must be exactly `/api`. It is baked in at build time, so verify
`Frontend/.env` and then re-run `deploy.sh`.

**certbot fails the challenge.**
DNS still isn't pointing here. Re-check step 2 and confirm port 80 is open
(`firewall-cmd --list-services`).

**Database connection refused.**
```sh
systemctl status postgresql
sudo -u postgres psql -c "\l"     # msu_transcripts should be listed
```

**`NotSupportedError: PostgreSQL 14 or later is required (found 13.x)`.**
AlmaLinux 9's default `postgresql` module stream is version 13; Django 6 needs
14+. `setup-server.sh` now selects a newer stream, but if the cluster was already
created on 13 — and it holds no data worth keeping — replace it:

```sh
systemctl stop postgresql
mv /var/lib/pgsql/data /var/lib/pgsql/data-pg13-backup
dnf -y module reset postgresql
dnf -y module enable postgresql:16 || dnf -y module enable postgresql:15
dnf -y install postgresql-server postgresql-contrib
postgresql-setup --initdb
```

Then re-apply the auth settings below and recreate the role and database. If the
cluster *does* hold data, dump it first (`pg_dumpall > /root/pg13.sql`) and
restore afterwards, or use `pg_upgrade`.

**`FATAL: Ident authentication failed for user "msu_transcripts"`.**
PostgreSQL is still using `ident` authentication for TCP connections, which maps
the operating-system user and ignores passwords — Django can never authenticate
through it. `setup-server.sh` normally converts this to `scram-sha-256`; if the
database was initialised before that fix, apply it by hand:

```sh
sed -i -E 's|^(host\s+all\s+all\s+127\.0\.0\.1/32\s+)ident|\1scram-sha-256|' /var/lib/pgsql/data/pg_hba.conf
sed -i -E 's|^(host\s+all\s+all\s+::1/128\s+)ident|\1scram-sha-256|'          /var/lib/pgsql/data/pg_hba.conf
sed -i -E 's|^#?\s*password_encryption\s*=.*|password_encryption = scram-sha-256|' /var/lib/pgsql/data/postgresql.conf
systemctl restart postgresql
```

Then **re-set the role password**, because the stored hash was created under the
old scheme and must be regenerated:

```sh
sudo -u postgres psql -c "ALTER ROLE msu_transcripts WITH PASSWORD 'yourpassword';"
```

---

## If you move to a bigger plan

`deploy/gunicorn.conf.py` is deliberately conservative for 1 GB. After resizing:

| RAM / vCPU | `workers` | `threads` |
| --- | --- | --- |
| 1 GB / 1 (current) | 2 | 4 |
| 2 GB / 2 | 3 | 4 |
| 4 GB / 4 | 5 | 4 |

Set it without editing the file by adding `GUNICORN_WORKERS=3` to
`Backend/.env`, then `systemctl restart msu-backend`. You can also raise
`NODE_OPTIONS=--max-old-space-size` in `msu-frontend.service` and drop the swap
file once you have comfortable headroom.

---

## Security notes

Already handled:

- Only 80/443/22 are open; app services and PostgreSQL bind to loopback.
- Services run as the unprivileged `msu` user, with systemd sandboxing
  (`ProtectSystem`, `PrivateTmp`, `NoNewPrivileges`).
- `DEBUG=False` is enforced, and Django won't boot without a real `SECRET_KEY`.
- Secure cookies, HSTS, nosniff and `X-Frame-Options: DENY` are on in
  production; `SECURE_PROXY_SSL_HEADER` is set so Django knows requests arrived
  over TLS.
- Every admin endpoint enforces the `IsAdmin` permission server-side. The
  frontend's route guard is a convenience only.
- `fail2ban` bans an IP for an hour after 5 failed SSH logins in 10 minutes.

### Harden SSH — do this soon

This server logged **52 failed root logins** between two of your own sessions.
That is routine for any public IP, but root login with a password is the one
thing worth closing quickly. `fail2ban` slows the attempts down; keys stop them.

From your **local machine**, create a key and install it:

```sh
ssh-keygen -t ed25519 -C "msu-vps"
ssh-copy-id root@198.54.112.154
# On Windows without ssh-copy-id, paste the contents of
# %USERPROFILE%\.ssh\id_ed25519.pub into /root/.ssh/authorized_keys
```

**Confirm the key works in a new session before locking passwords out** — if you
skip this and the key is wrong, you are locked out of your own server and need
the provider's VNC console to recover.

Then on the server:

```sh
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sshd -t && systemctl reload sshd     # sshd -t validates before reloading
```

Check the bans any time with `fail2ban-client status sshd`.

### Also worth doing

- Automated, off-server database backups (see the `pg_dump` command above).
- `dnf -y install dnf-automatic` and enable `dnf-automatic-install.timer` for
  unattended security updates.
