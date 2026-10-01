from django.core.management.base import BaseCommand, CommandError

from accounts.models import Role, User, UserRole


class Command(BaseCommand):
    help = "Grant the admin role to an account, creating it first with --password if needed."

    def add_arguments(self, parser):
        parser.add_argument("email")
        parser.add_argument("--password", help="Required only when the account does not exist.")

    def handle(self, *args, email, password=None, **options):
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            if not password:
                raise CommandError("No such user. Pass --password to create the account.")
            user = User.objects.create_user(email=email, password=password)
            self.stdout.write(f"Created {user.email}")
        UserRole.objects.get_or_create(user=user, role=Role.ADMIN)
        self.stdout.write(self.style.SUCCESS(f"{user.email} is an admin."))
