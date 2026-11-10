from django.db import migrations

# A fuller list of Zimpost branches, grouped by province (B6.3). Only adds
# branches that are missing; admins can import more from a CSV file.
BRANCHES = {
    "Bulawayo": ["Bulawayo Main", "Famona", "Hillside", "Llewellin", "Nkulumane", "Pumula"],
    "Harare": [
        "Harare Main",
        "Avondale",
        "Borrowdale",
        "Chitungwiza",
        "Epworth",
        "Highfield",
        "Mbare",
        "Norton",
        "Ruwa",
    ],
    "Manicaland": [
        "Mutare",
        "Rusape",
        "Chipinge",
        "Nyanga",
        "Chimanimani",
        "Murambinda",
        "Sakubva",
    ],
    "Mashonaland Central": ["Bindura", "Mount Darwin", "Mvurwi", "Guruve", "Shamva", "Glendale"],
    "Mashonaland East": ["Marondera", "Murehwa", "Mutoko", "Chivhu", "Macheke", "Goromonzi"],
    "Mashonaland West": ["Chinhoyi", "Kadoma", "Chegutu", "Karoi", "Kariba", "Banket", "Raffingora"],
    "Masvingo": ["Masvingo", "Chiredzi", "Gutu", "Triangle", "Zaka", "Bikita"],
    "Matabeleland North": ["Victoria Falls", "Hwange", "Lupane", "Binga", "Dete"],
    "Matabeleland South": ["Gwanda", "Beitbridge", "Plumtree", "Filabusi", "Esigodini"],
    "Midlands": [
        "Gweru",
        "Kwekwe",
        "Zvishavane",
        "Shurugwi",
        "Gokwe",
        "Redcliff",
        "Mvuma",
        "Lalapanzi",
    ],
}


def seed(apps, schema_editor):
    ZimpostBranch = apps.get_model("branches", "ZimpostBranch")
    for area, towns in BRANCHES.items():
        for town in towns:
            exists = ZimpostBranch.objects.filter(branch_name__iexact=town).exists() or (
                ZimpostBranch.objects.filter(branch_name__istartswith=f"{town} ").exists()
            )
            if not exists:
                ZimpostBranch.objects.create(branch_name=town, branch_area=area, active=True)


class Migration(migrations.Migration):
    dependencies = [("branches", "0001_initial")]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
