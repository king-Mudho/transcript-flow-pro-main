from django.db import migrations

# Harare suburbs for the request form and dispatch grouping (B9.7). Admins can
# add, rename or deactivate them in Settings.
SUBURBS = [
    ("Arcadia", "Central"),
    ("Ashdown Park", "North-west"),
    ("Avondale", "North"),
    ("Avonlea", "North-west"),
    ("Belgravia", "North"),
    ("Belvedere", "West"),
    ("Bluff Hill", "North-west"),
    ("Borrowdale", "North"),
    ("Borrowdale Brooke", "North"),
    ("Braeside", "South-east"),
    ("Budiriro", "South-west"),
    ("Chisipite", "North-east"),
    ("City Centre", "Central"),
    ("Cranborne", "South-east"),
    ("Dzivarasekwa", "West"),
    ("Eastlea", "East"),
    ("Emerald Hill", "North-west"),
    ("Epworth", "South-east"),
    ("Glen Lorne", "North-east"),
    ("Glen Norah", "South-west"),
    ("Glen View", "South-west"),
    ("Greendale", "East"),
    ("Greystone Park", "North-east"),
    ("Gunhill", "North"),
    ("Hatfield", "South-east"),
    ("Highfield", "South-west"),
    ("Highlands", "North-east"),
    ("Hillside", "South-east"),
    ("Kambuzuma", "West"),
    ("Kuwadzana", "West"),
    ("Mabelreign", "North-west"),
    ("Mabvuku", "East"),
    ("Mainway Meadows", "South-west"),
    ("Mandara", "North-east"),
    ("Marlborough", "North-west"),
    ("Mbare", "South"),
    ("Milton Park", "Central"),
    ("Mount Pleasant", "North"),
    ("Msasa", "East"),
    ("Mufakose", "South-west"),
    ("Newlands", "North-east"),
    ("Park Meadowlands", "East"),
    ("Pomona", "North"),
    ("Prospect", "South"),
    ("Queensdale", "South-east"),
    ("Rhodesville", "East"),
    ("Ruwa", "East"),
    ("Sentosa", "North-west"),
    ("Southerton", "South"),
    ("Strathaven", "North-west"),
    ("Sunningdale", "South-east"),
    ("Tafara", "East"),
    ("Tynwald", "West"),
    ("Warren Park", "West"),
    ("Waterfalls", "South"),
    ("Westgate", "West"),
    ("Workington", "South"),
]


def seed(apps, schema_editor):
    SiteSettings = apps.get_model("core", "SiteSettings")
    Suburb = apps.get_model("core", "Suburb")
    SiteSettings.objects.get_or_create(pk=1)
    for name, area in SUBURBS:
        Suburb.objects.get_or_create(name=name, defaults={"area": area})


class Migration(migrations.Migration):
    dependencies = [("core", "0001_initial")]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
