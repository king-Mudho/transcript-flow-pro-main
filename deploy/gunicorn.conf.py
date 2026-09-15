"""Gunicorn configuration for the Django API.

Sized for a 1 GB / 1 vCPU VPS that also runs PostgreSQL, nginx and the Node SSR
server. The usual `2 * cpu + 1` formula would be 3 workers; that is too many
here, because each worker is a full Python process holding its own database
connection. Two workers keep a request from blocking the whole API while leaving
memory for everything else.

Raise `workers` if you move to a larger plan — see the table in
deploy/DEPLOYMENT.md.
"""

import os

# Bind to loopback only. nginx is the sole entry point from the internet; the
# API must never be reachable directly on port 8000.
bind = "127.0.0.1:8000"

# Fixed at 2 rather than derived from CPU count, for the reason above. Override
# with GUNICORN_WORKERS if the server is resized.
workers = int(os.environ.get("GUNICORN_WORKERS", 2))

# Threads let a worker keep serving while another request waits on the database
# or on generating an .xlsx export.
threads = int(os.environ.get("GUNICORN_THREADS", 4))
worker_class = "gthread"

# Must exceed nginx's proxy_read_timeout for the export endpoint (120s), or
# gunicorn kills the worker mid-response and nginx returns 502.
timeout = 180
graceful_timeout = 30

# Slightly under nginx's default keepalive so nginx closes connections first.
keepalive = 5

# Recycle workers periodically to bound the effect of any slow memory growth.
# The jitter stops both workers restarting at the same instant.
max_requests = 1000
max_requests_jitter = 100

# journalctl captures stdout/stderr for the systemd unit.
accesslog = "-"
errorlog = "-"
loglevel = os.environ.get("GUNICORN_LOG_LEVEL", "info")
# Include the real client IP that nginx forwarded, not nginx's own address.
access_log_format = '%({x-forwarded-for}i)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" %(D)sus'

# The systemd unit uses Type=notify. Gunicorn detects NOTIFY_SOCKET on its own
# and signals readiness, so nothing extra is needed here — but do not add
# `daemon = True`, which would break that handshake.
