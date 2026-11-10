"""Time-based one-time codes (RFC 6238), the second sign-in factor.

Implemented here rather than with a library because it is about thirty lines
and works with every authenticator app (Google Authenticator, Microsoft
Authenticator, Authy, 1Password …): SHA-1, 6 digits, 30-second steps.
"""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

STEP = 30
DIGITS = 6


def new_secret() -> str:
    """A random 160-bit secret, base32-encoded as authenticator apps expect."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _code(secret: str, counter: int) -> str:
    padded = secret.upper() + "=" * (-len(secret) % 8)
    key = base64.b32decode(padded)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(number % 10**DIGITS).zfill(DIGITS)


def code_at(secret: str, when: float | None = None) -> str:
    return _code(secret, int((when if when is not None else time.time()) // STEP))


def verify(secret: str, code: str, window: int = 1) -> bool:
    """Accept the current code and one step either side, for clock drift."""
    if not secret:
        return False
    code = "".join(ch for ch in str(code or "") if ch.isdigit())
    if len(code) != DIGITS:
        return False
    counter = int(time.time() // STEP)
    return any(
        hmac.compare_digest(_code(secret, counter + delta), code)
        for delta in range(-window, window + 1)
    )


def provisioning_uri(secret: str, account: str, issuer: str) -> str:
    label = quote(f"{issuer}:{account}")
    return f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer)}&digits={DIGITS}&period={STEP}"
