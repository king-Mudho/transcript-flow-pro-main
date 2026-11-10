# MSU Transcript Collection Solution

A web application for Midlands State University graduates to request their academic transcripts
and certificates online. Graduates complete four short steps (details, clearance, documents and
delivery, check and submit), get a reference number, and follow their document on a tracking page
until a driver hands it over in Harare or it reaches their Zimpost branch. Payment is cash.

The operations team works from a workspace: an overview, a requests list by stage, hand-in lists
for MSU, collection runs, dispatch batches with drivers, waybills and barcode labels, payments and
cash reconciliation, reports, and an admin Settings hub (prices, branches, suburbs, team, messages,
brand, data protection, audit log). MSU staff get their own release queue when an admin switches
the MSU portal on.

The design (`docs/MSU Transcript Collection Redesign.pdf`) and the backlog it implements
(`docs/MSU Transcript Connect Backlog.pdf`) are in `docs/`. **`docs/handover/`** holds the
handover and sale pack: backlog status item by item, architecture and data model, user guide,
runbook, security review, data protection pack, draft service levels, UAT checklist and release
notes.

---

## Architecture

The project is two independent applications that talk over a REST API.

| | Backend | Frontend |
| --- | --- | --- |
| **Folder** | `Backend/` | `Frontend/` |
| **Stack** | Django 6, Django REST Framework | TanStack Start, React 19 |
| **Auth** | JWT (SimpleJWT), access + refresh tokens | Tokens in `localStorage`, sent as `Authorization: Bearer` |
| **Data** | PostgreSQL | none — all data comes from the API |
| **Styling** | — | Tailwind CSS v4, shadcn/ui components |
| **Serves on** | `http://127.0.0.1:8000` | `http://localhost:8080` |

**How they communicate.** The browser calls the Django API directly. Every frontend request goes
through a single module, `Frontend/src/lib/api-client.ts`, which attaches the access token, refreshes
it transparently when it expires, and converts API errors into readable messages. No component
fetches the API on its own.

**Where authorization actually happens.** Every endpoint carries a permission class from
`Backend/accounts/permissions.py`: `IsAdmin` (prices, branches, drivers, team, settings),
`IsTeam` (admins and staff: day-to-day work), `IsMsuStaff` (the MSU portal, only while it is
switched on) or `IsTeamOrMsu`. The frontend hides what a role cannot use, but that is not a
security boundary. Any new endpoint must carry a permission class. With `REQUIRE_MFA` on (the
production default), team tokens must also carry the second-factor claim.

---

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 20+ (verified on v24.18.0) | for the frontend |
| Python | 3.11+ (verified on 3.13.14) | for the backend |
| Docker Desktop | any recent version (verified on 29.6.2) | runs PostgreSQL locally, must be running |

PostgreSQL is used in development as well as production, deliberately — SQLite behaves differently
enough to hide real problems.

---

## Opening this in VS Code

This folder (`transcript-flow-pro-main/`) is not a git repository, so open it directly with
**File → Open Folder**, not `git clone`. It contains two independent projects (`Backend/`,
`Frontend/`), each with its own dependencies and its own run command — VS Code doesn't need to know
that, but you do, since every command below has to run from the right one.

**Recommended extensions** — install these for the editor to actually understand the two stacks:

| Extension | Id | Why |
| --- | --- | --- |
| Python | `ms-python.python` | Django/pytest support, run/debug |
| Pylance | `ms-python.vscode-pylance` | type checking, import resolution |
| ESLint | `dbaeumer.vscode-eslint` | matches `npm run lint` inline |
| Prettier | `esbenp.prettier-vscode` | matches `Frontend/.prettierrc` |
| Tailwind CSS IntelliSense | `bradlc.vscode-tailwindcss` | class name autocomplete in `Frontend/src` |

**Point VS Code at the backend's virtual environment**, or Pylance will flag every Django import as
unresolved: `Ctrl+Shift+P` → **Python: Select Interpreter** → **Enter interpreter path** →
`Backend\venv\Scripts\python.exe` (create the venv first if it doesn't exist yet — see step 2 below).

**Run both servers side by side** with two integrated terminals (`` Ctrl+` `` then the split-terminal
icon, or open a second one with the same shortcut): one `cd Backend` and running
`python manage.py runserver`, the other `cd Frontend` running `npm run dev`. Leave both running while
you use the app in the browser.

---

## Backend setup

All commands run from the repository root unless stated otherwise.

### 1. Start PostgreSQL

```sh
docker compose up -d db
```

This starts PostgreSQL on port 5432 with the database, user and password defined in
`docker-compose.yml`. Data persists in a Docker volume between restarts.

### 2. Create a virtual environment and install dependencies

```sh
cd Backend
python -m venv venv
venv\Scripts\activate            # Windows
# source venv/bin/activate       # macOS / Linux
pip install -r requirements.txt
```

To also install the linter, add `-r requirements-dev.txt`.

### 3. Configure the environment

```sh
copy .env.example .env           # Windows
# cp .env.example .env           # macOS / Linux
```

The defaults already match `docker-compose.yml`, so no edits are needed for local development. The
file sets `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, the PostgreSQL connection, and
`CORS_ALLOWED_ORIGINS`.

### 4. Create the database tables

```sh
python manage.py migrate
```

### 5. Run the server

```sh
python manage.py runserver
```

The API is now available at `http://127.0.0.1:8000/api/`.

> **There is no public sign-up.** Admin accounts are created from the command line:
> `python manage.py make_admin you@example.com --password 'a-strong-password'` (omit `--password`
> to grant the role to an account that already exists). Staff can reset a forgotten password from
> the sign-in page; in development the reset email is printed in the server console.

---

## Frontend setup

### 1. Install dependencies

```sh
cd Frontend
npm install
```

### 2. Configure the environment

`Frontend/.env` sets one variable, pointing at the backend:

```sh
VITE_API_URL="http://127.0.0.1:8000/api"
```

### 3. Run the dev server

```sh
npm run dev
```

The app is now available at `http://localhost:8080`.

---

## Running both together

Start them in this order, each in its own terminal:

| Step | Where | Command | Result |
| --- | --- | --- | --- |
| 1 | repo root | `docker compose up -d db` | PostgreSQL on `:5432` |
| 2 | `Backend/` | `python manage.py runserver` | API on `http://127.0.0.1:8000` |
| 3 | `Frontend/` | `npm run dev` | App on `http://localhost:8080` |

The backend must be running before you use the app, or every page that loads data will report that
the server can't be reached.

---

## First-time use

1. **Create the administrator account.** From `Backend/`, run
   `python manage.py make_admin you@example.com --password 'a-strong-password'`.
2. **Sign in** at `http://localhost:8080/auth`. You land on `/admin`, the Overview. (Locally
   `REQUIRE_MFA` is off unless you set it; in production you set up two-step sign-in first.)
3. **Check Settings.** Prices, Harare suburbs and 60+ Zimpost branches are seeded by the
   migrations. Adjust them under **Settings**.
4. **Submit a request as a graduate.** Open `http://localhost:8080/request` in a private window and
   complete the four steps. Note the reference number.
5. **Track it** at `/status` with the reference and the registration number.
6. **Work it as the team.** In **Requests**, open it, switch clearance **Verified** on, and
   **Submit to MSU** (a hand-in list is created). Then mark it ready, collected, add it to a dispatch
   batch on **Dispatch**, mark it delivered on the batch page and **Close batch** with the cash.
7. **Export** from Requests with **Export to Excel** (every matching row, not just the page).

---

## Testing

**Backend** — 125 tests covering submission hardening, validation and consent, duplicates,
several documents, clearance uploads, the six-status flow, history, hand-in lists, the public
tracking payload and its rate limit, lost-reference lookup, delivery edits and locking, payments
and reversals, prices, drivers and availability, dispatch batches and cash reconciliation, Zimpost
dispatch, paging and export, roles (admin, staff, MSU staff), two-step sign-in, the MSU portal, the
monthly report, data retention, graduate data export and erasure, and access control on every
protected endpoint:

```sh
cd Backend
python manage.py test tests
```

Linting (needs `requirements-dev.txt` installed):

```sh
cd Backend
ruff check .
ruff format .
```

**Frontend:**

```sh
cd Frontend
npx tsc --noEmit     # type check
npm run lint         # eslint + prettier
npm run build        # production build
npm run preview      # serve the production build locally
```

**Last full pass (2026-11-10, stages 4 to 11 and the redesign):** the backend's 125 tests pass,
`ruff check` is clean, `makemigrations --check` finds nothing, `manage.py check --deploy` passes,
and the frontend type-checks, lints (no errors) and builds. In a browser against a local server:
the four-step request flow on a 375px phone (refresh keeps answers, Change returns to the check
step, consent gates Submit), confirmation, tracking for dispatched and rejected requests, admin
sign-in, Overview, Requests, request detail (clearance switch, Submit to MSU with a hand-in list),
Dispatch with driver availability, batch delivery and cash close with a variance, every PDF
builder, Settings and the audit log, the MSU portal, and staff role limits. The new migrations were
also run against rows in the previous shape to confirm the backfill.

---

## Project structure

```text
.
├── Backend/                  Django REST API
│   ├── accounts/             users, roles, two-step sign-in (mfa.py), team invitations
│   ├── core/                 site settings, suburbs, audit log, analytics, health check
│   ├── branches/             Zimpost branches (public read, admin write, CSV import)
│   ├── requests_app/         requests: status rules, history, payments, dispatch,
│   │                         hand-in lists, notifications, MSU portal, reports
│   │   └── management/       `apply_retention` (daily data retention)
│   ├── config/               settings, root URLs, WSGI/ASGI
│   └── tests/                the test suite
│
├── Frontend/                 TanStack Start app
│   ├── public/               share image, icons, manifest, robots.txt, sitemap.xml
│   └── src/
│       ├── routes/           index, request, status, privacy, terms, auth, security, msu,
│       │   └── _authenticated/   admin.* pages (overview, requests, dispatch, batch,
│       │                         drivers, collections, cash, reports, settings)
│       ├── components/       ds.tsx (design system), request-flow, tracking-stepper,
│       │                     admin-shell, status-move-dialog, combobox, shadcn/ui
│       └── lib/              api-client, pdf (all PDFs), code128, site (settings, brand)
│
├── deploy/                   setup, deploy, backup/restore scripts, nginx, systemd units
│                             and timers (backend, frontend, backup, retention), env templates
├── docs/                     design, backlog, and handover/ (the sale pack)
└── docker-compose.yml        PostgreSQL for local development
```

Route files are named by path: `admin.requests.$requestId.tsx` serves `/admin/requests/:id`.
`Frontend/src/routeTree.gen.ts` is generated — never edit it by hand.

---

## Troubleshooting

**Requests from the app fail, and the browser console mentions CORS.**
The frontend's origin must be listed in the backend's `CORS_ALLOWED_ORIGINS`. It defaults to port
8080, which is what `npm run dev` uses. If you run the frontend on a different port, add that origin
to `Backend/.env` and restart the Django server.

**Every page reports "Could not reach the server".**
The Django server isn't running, or `VITE_API_URL` in `Frontend/.env` points somewhere else. Confirm
`http://127.0.0.1:8000/api/branches/?active=true` responds in a browser.

**`django.db.utils.OperationalError` on startup.**
PostgreSQL isn't up. Run `docker compose up -d db` from the repository root and check
`docker compose ps` reports it as healthy.

**Signed in successfully but bounced off `/admin`.** (MSU staff accounts go to `/msu`; with
`REQUIRE_MFA` on, everyone sets up two-step sign-in at `/security` first.)
That account doesn't hold the `admin` role. Grant it with
`python manage.py make_admin the-account@example.com`.

**A status lookup that should match returns nothing.**
Both the reference number and the registration number must match the same request. Both are
upper-cased and the registration number has spaces removed before the lookup.

**`DEBUG` must be `False` outside local development.**
With `DEBUG=True`, Django serves full stack traces and settings on any error. It is `True` in
`.env.example` because that file is for local setup — never deploy with it on.

---

## Deployment

Production deployment to **collectmytranscriptmsu.com** (AlmaLinux 9 VPS) is fully configured in
[`deploy/`](deploy/). Follow **[deploy/DEPLOYMENT.md](deploy/DEPLOYMENT.md)** — it covers server
bootstrap, DNS, environment files, HTTPS, and day-to-day operations.

The short version, on a blank server:

```sh
bash deploy/setup-server.sh              # once: packages, swap, user, database, firewall
# point DNS at the server, then fill in the two .env templates
sudo bash deploy/deploy.sh               # build + start (also used for every update)
cp deploy/nginx/*.conf /etc/nginx/conf.d/ && systemctl reload nginx
certbot --nginx -d collectmytranscriptmsu.com -d www.collectmytranscriptmsu.com
```

Key points about the production setup:

- **One origin.** nginx serves the frontend at `/` and proxies `/api` to Django on the same domain,
  so there are no cross-origin requests and CORS is left empty.
- **Two builds.** `npm run build` produces a fetch handler for `vite preview`; `npm run build:server`
  produces the self-listening Node server that systemd runs. Only the latter is deployable.
- **Build-time config.** `VITE_API_URL` is compiled into the bundle, so changing `Frontend/.env`
  requires a rebuild.
- **Fails loudly.** Django refuses to start with `DEBUG=False` and no `SECRET_KEY`.
- **Database.** `docker-compose.yml` is for local development only; the server runs PostgreSQL
  natively, set up by `deploy/setup-server.sh`.
