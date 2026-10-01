"""
Django settings for config project.
"""

from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, False),
)
env_file = BASE_DIR / ".env"
if env_file.exists():
    environ.Env.read_env(env_file)

DEBUG = env.bool("DEBUG", default=False)

# A weak fallback key is fine for local development but must never reach a
# deployed server, so refuse to start rather than run with a known key.
if DEBUG:
    SECRET_KEY = env("SECRET_KEY", default="django-insecure-dev-key-change-me")
else:
    try:
        SECRET_KEY = env("SECRET_KEY")
    except environ.ImproperlyConfigured as exc:
        raise environ.ImproperlyConfigured(
            "SECRET_KEY must be set when DEBUG is False. Generate one with:\n"
            '  python -c "import secrets; print(secrets.token_urlsafe(64))"'
        ) from exc

ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])


# Application definition

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "accounts",
    "branches",
    "requests_app",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# Database
# Postgres only (no SQLite) so local dev matches production behavior.

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", default="msu_transcripts"),
        "USER": env("POSTGRES_USER", default="msu_transcripts"),
        "PASSWORD": env("POSTGRES_PASSWORD", default="msu_transcripts"),
        "HOST": env("POSTGRES_HOST", default="localhost"),
        "PORT": env("POSTGRES_PORT", default="5432"),
    }
}

AUTH_USER_MODEL = "accounts.User"

# Password validation

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# Internationalization

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True


# Static files
#
# Only the Django admin has static assets — the public site is served entirely
# by the frontend. STATIC_ROOT is where `collectstatic` gathers them so nginx can
# serve /django-static/ directly; without it the deployed admin loads unstyled.

STATIC_URL = "/django-static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# Django REST Framework / SimpleJWT
#
# Auth is JWT bearer tokens, deliberately NOT SessionAuthentication: the frontend
# is a separately-served SPA, so there are no auth cookies and therefore no CSRF
# plumbing to maintain on the API.

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    # Endpoints opt in to protection individually via permission_classes; the
    # public ones (create request, status lookup, active branches) rely on this.
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.AllowAny",),
    # Serialize Decimals as JSON numbers, not strings. The UI interpolates
    # fee_amount directly, so a string would render "US$15.00" instead of "US$15".
    "COERCE_DECIMAL_TO_STRING": False,
    # Rate limits for the anonymous endpoints (request submission, password
    # reset). nginx sets X-Forwarded-For, so one proxy hop is trusted.
    "DEFAULT_THROTTLE_RATES": {"submit": "30/hour", "password_reset": "10/hour"},
    "NUM_PROXIES": env.int("NUM_PROXIES", default=0 if DEBUG else 1),
}

# Password-reset emails. Without SMTP settings, emails are printed to the
# server log (journalctl in production).
EMAIL_HOST = env("EMAIL_HOST", default="")
if EMAIL_HOST:
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
    EMAIL_PORT = env.int("EMAIL_PORT", default=587)
    EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
    EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
    EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
else:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
DEFAULT_FROM_EMAIL = env(
    "DEFAULT_FROM_EMAIL", default="MSU Transcript <noreply@collectmytranscriptmsu.com>"
)
# Base URL used to build links in emails.
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:8080")

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}


# CORS
#
# In production the frontend and API share one origin (nginx proxies /api to
# this app), so no cross-origin requests occur and this list is empty. It exists
# for local development, where Vite serves on a different port.

CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=[
        # `vite dev` serves on 8080 (see vite.config.ts); 5173 is Vite's default
        # if the port is overridden.
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
)


# Production hardening
#
# All of this is conditional on DEBUG being off, so local development over plain
# HTTP keeps working. Deployed, the app sits behind nginx which terminates TLS.

if not DEBUG:
    # nginx terminates TLS and forwards over plain HTTP. Without this header
    # Django believes every request is insecure: it would build http:// absolute
    # URLs and refuse to set cookies marked secure.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

    # nginx already redirects http -> https; leaving this on would double-handle
    # it, so it is opt-in via the environment.
    SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=False)

    # security.W008 warns that SECURE_SSL_REDIRECT is off. That is intentional
    # here — nginx performs the redirect — and silencing it keeps
    # `manage.py check --deploy` clean so a real warning stands out.
    SILENCED_SYSTEM_CHECKS = ["security.W008"]

    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

    # Needed for the Django admin login form to accept POSTs over HTTPS.
    CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])

    # Six months. Raise deliberately, and only once you're sure HTTPS works —
    # browsers cache this and will refuse plain HTTP for the whole duration.
    SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=15768000)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = "DENY"

    # Log to stdout/stderr so journalctl captures everything for the systemd
    # unit; there is no log file to rotate.
    LOGGING = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "standard": {"format": "[{asctime}] {levelname} {name}: {message}", "style": "{"},
        },
        "handlers": {
            "console": {"class": "logging.StreamHandler", "formatter": "standard"},
        },
        "root": {"handlers": ["console"], "level": "INFO"},
        "loggers": {
            "django.request": {"handlers": ["console"], "level": "ERROR", "propagate": False},
        },
    }
