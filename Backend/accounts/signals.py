from django.db.models.signals import post_save
from django.dispatch import receiver

from accounts.models import Role, User, UserRole


@receiver(post_save, sender=User)
def bootstrap_first_admin(sender, instance, created, **kwargs):
    """Grant the ``admin`` role to the first user ever created.

    This solves the chicken-and-egg problem of a fresh deployment: without it
    nobody could reach the admin dashboard, because granting the role requires
    an existing admin.

    The condition is "no admin exists anywhere", not "no users exist" — so if
    every admin is later deleted, the next account created is promoted. On a
    live system, sign up the real administrator immediately after deploying so
    that account claims the role.
    """
    if created and not UserRole.objects.filter(role=Role.ADMIN).exists():
        UserRole.objects.create(user=instance, role=Role.ADMIN)
