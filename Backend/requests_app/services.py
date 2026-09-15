import random

from django.utils import timezone

from requests_app.models import Request

# How many times to retry when a generated reference number is already taken.
# Collisions are rare (1 in a million per attempt against a small table), so
# exhausting this many attempts means something is wrong rather than unlucky.
MAX_REFERENCE_ATTEMPTS = 10


def generate_reference_number() -> str:
    """Return an unused reference number in the form ``MSU-<year>-<6 digits>``.

    The number is random rather than sequential so it can't be used to infer how
    many requests exist or to guess someone else's reference.

    Call this inside the same transaction as the ``Request`` insert. The
    check-then-insert is not atomic on its own, so a concurrent writer could
    still claim the same number between the check and the insert; the unique
    constraint on ``reference_number`` is what ultimately guarantees uniqueness,
    and the surrounding transaction is what keeps the failure clean.
    """
    for _ in range(MAX_REFERENCE_ATTEMPTS):
        candidate = f"MSU-{timezone.now().year}-{random.randint(0, 999999):06d}"
        if not Request.objects.filter(reference_number=candidate).exists():
            return candidate
    raise RuntimeError(
        f"Could not generate a unique reference number after {MAX_REFERENCE_ATTEMPTS} attempts"
    )
