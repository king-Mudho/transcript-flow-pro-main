# MSU Transcript Collection Solution

A web application for Midlands State University graduates to request delivery of their academic
transcripts and certificates. A graduate fills in a short form, confirms they have been cleared by
their department, accounts and the library, and chooses delivery either to an address in Harare
(paid cash on delivery) or to their nearest Zimpost branch (paid by cash deposit). They receive a
reference number they can use to track the request at any time. Staff administrators work through
incoming requests from a dashboard: filtering, updating status, marking payment received, exporting
batches to Excel, and maintaining the list of Zimpost branches offered on the public form.

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

**Where authorization actually happens.** Each admin endpoint carries Django's `IsAdmin` permission
class. The frontend also hides admin pages from non-admins, but that is only to avoid showing a
dashboard whose every request would be rejected — it is not a security boundary and can be bypassed
in the browser. Any new admin endpoint must carry the permission class.

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

Walk this through once after setup to confirm everything is wired together correctly.

1. **Create the administrator account.** From `Backend/`, run
   `python manage.py make_admin you@example.com --password 'a-strong-password'`.
2. **Sign in.** Open `http://localhost:8080/auth` and use those credentials. You land on `/admin`, the requests
   dashboard, which will be empty.
3. **Add a Zimpost branch.** Go to **Zimpost Branches**, click **Add branch**, and save one (for
   example "Gweru Post Office" / "Gweru"). Only branches marked active appear on the public form.
4. **Submit a request as a graduate.** Open `http://localhost:8080/request` in a private window (so
   you are not signed in) and complete the five steps. Copy the reference number shown at the end —
   it looks like `MSU-2026-482915`.
5. **Check the status.** At `/status`, enter that reference number together with the registration
   number you used. Both must match. The page shows the current status and fee.
6. **Process it as an admin.** Back on `/admin`, the request now appears in the table. Open it to see
   the full details, change its status, and tick **Paid**.
7. **Export.** Click **Export filtered to Excel**. An `.xlsx` file downloads containing the rows
   currently matching your filters, and those rows are stamped as exported.
8. **Sign out** and try visiting `/admin` again — you are redirected to the sign-in page.

---

## Testing

**Backend** — 76 tests covering submission hardening, the six-status flow and its transition rules,
the history log, the public tracking payload, delivery-detail edits and locking, drivers, dispatch
batches, Zimpost dispatch, paging and export, password reset, and admin-only access on every
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

**Last full pass (2026-10-01, stages 0 to 3 of the development brief):** backend's 76 tests pass,
`ruff check`/`ruff format --check` are clean, the frontend type-checks, lints and builds, and the
admin flow (sign-in, bulk status move, dispatch batch with a driver, waybill PDF, history tab) and
the public tracking page (stepper, driver card, Zimpost details, 360px width) were exercised in a
browser against a local server. The status-flow migration was also run against rows in the old
four-status shape to confirm the mapping and the history backfill.

---

## Project structure

```text
.
├── Backend/                  Django REST API
│   ├── accounts/             users, roles, JWT auth endpoints
│   │   ├── models.py         custom User (email login) + UserRole
│   │   ├── permissions.py    IsAdmin — the real authorization gate
│   │   ├── management/       `make_admin` command
│   │   └── views.py          signup / logout / me
│   ├── branches/             Zimpost branch directory (public read, admin write)
│   ├── requests_app/         transcript requests
│   │   ├── models.py         Request + status/zone/payment enums
│   │   ├── serializers.py    per-audience field sets
│   │   ├── services.py       reference-number generation
│   │   └── views.py          submit, status lookup, admin list, export
│   ├── config/               settings, root URLs, WSGI/ASGI
│   ├── tests/                the test suite
│   ├── requirements.txt      runtime dependencies
│   └── ruff.toml             lint configuration
│
├── Frontend/                 TanStack Start app
│   └── src/
│       ├── routes/           file-based routing
│       │   ├── index.tsx             /          landing page
│       │   ├── request.tsx           /request   five-step request form
│       │   ├── status.tsx            /status    public status lookup
│       │   ├── auth.tsx              /auth      sign in / register
│       │   └── _authenticated/       admin-only pages
│       │       ├── route.tsx         the guard
│       │       ├── admin.index.tsx   /admin
│       │       └── admin.branches.tsx /admin/branches
│       ├── components/       app components + shadcn/ui primitives
│       └── lib/
│           ├── api-client.ts the single data layer
│           └── msu.ts        fees, status labels, formatting
│
├── deploy/                   production deployment for collectmytranscriptmsu.com
│   ├── DEPLOYMENT.md         step-by-step server setup guide
│   ├── setup-server.sh       one-time AlmaLinux 9 bootstrap
│   ├── deploy.sh             build + restart (first deploy and every update)
│   ├── gunicorn.conf.py      WSGI server tuning
│   ├── nginx/                site config (single origin, /api proxied)
│   ├── systemd/              msu-backend + msu-frontend units
│   └── env-templates/        production .env templates
│
├── docker-compose.yml        PostgreSQL for local development
└── README.md                 this file
```

Route files are named by path: `admin.index.tsx` serves `/admin` and `admin.branches.tsx` serves
`/admin/branches`. `Frontend/src/routeTree.gen.ts` is generated — never edit it by hand.

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

**Signed in successfully but bounced off `/admin`.**
That account doesn't hold the `admin` role. Grant it with
`python manage.py make_admin the-account@example.com`.

**A status lookup that should match returns nothing.**
Both the reference number and the registration number must match the same request. The registration
number is compared case-insensitively; the reference number is not.

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
