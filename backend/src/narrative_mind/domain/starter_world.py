"""The starter world every account begins with: the Verge worldset.

The data lives here, in the package, rather than in `scripts/` because it has two
consumers that must not drift apart — `AuthService.register`, which gives each new
account its own copy, and `scripts/seed_world.py`, which resets one back to it.

Ids are derived from `(owner_id, slug)` rather than from the slug alone. Every
account holds its own copy of the same twenty-seven entities, and `id` is globally
unique per label (see db/migrations.py), so two accounts sharing a slug must still
end up with different ids. Deriving from both keeps that true while staying
reproducible: re-seeding one account rebuilds the same graph instead of a second
copy of it.
"""

from uuid import UUID, uuid5

NAMESPACE = UUID("6f9b1c1e-0f4a-5c3d-9e2b-7a1d4f8c2b60")

# The labels a world is made of. `:User` is deliberately absent: accounts are not
# part of any world, and nothing in this module or world_repo.py touches them.
WORLD_LABELS = ("Character", "Location", "Faction", "Event")


def entity_id(owner_id: str, slug: str) -> str:
    """The id this owner's copy of `slug` gets. Stable across re-seeds."""
    return str(uuid5(NAMESPACE, f"{owner_id}:{slug}"))


# --- Locations -------------------------------------------------------------
# Two regions split by altitude: everything below the new waterline drowned,
# everything above it inherited the survivors.
LOCATIONS = [
    (
        "ironmere",
        "Ironmere",
        "The Drowned Vale",
        "The old capital, taken by the sea in a single night. Its upper towers still "
        "break the surface at low tide, and salvage crews work them from boats.",
    ),
    (
        "greyfen",
        "Greyfen",
        "The Drowned Vale",
        "A stilt-town raised over the marsh by refugees from Ironmere. Crowded, "
        "sinking by inches, and the only lowland settlement still holding.",
    ),
    (
        "saltmarch",
        "Saltmarch",
        "The Drowned Vale",
        "Tidal flats where the Guild rakes salt from the new shallows. The Vale's "
        "one reliable export, and therefore its one reliable grievance.",
    ),
    (
        "kestrelwatch",
        "Kestrelwatch",
        "The High Verge",
        "A cliff fortress that sits four hundred feet above the waterline. It lost "
        "nothing to the flood, which is the beginning of most arguments about it.",
    ),
    (
        "coldharrow",
        "Coldharrow",
        "The High Verge",
        "A mountain cloister housing the last consolidated record of the world "
        "before the water. Cold, remote, and deliberately hard to reach.",
    ),
    (
        "duskvale",
        "Duskvale",
        "The High Verge",
        "A crossroads market where the high roads meet the salvage routes. Neutral "
        "ground by custom rather than by treaty, which has mostly held.",
    ),
]

# --- Factions --------------------------------------------------------------
FACTIONS = [
    (
        "tidebinders",
        "The Tidebinders",
        "The sea is a mechanism, and a mechanism can be governed.",
        "Engineers and sluice-workers who believe the Vale can be reclaimed with "
        "locks and pumps. Seated at Greyfen, perpetually short of materials.",
    ),
    (
        "kestrel-order",
        "Kestrel Order",
        "The flood was a judgment. The high ground was earned.",
        "A martial order holding Kestrelwatch and its granaries. Disciplined, "
        "well-provisioned, and increasingly unable to explain the Long Winter.",
    ),
    (
        "salt-guild",
        "The Salt Guild",
        "Commerce is the only party with no side to take.",
        "The cartel controlling salt, shipping, and most lowland credit. Insists on "
        "its own neutrality more often than anyone else finds convincing.",
    ),
    (
        "quiet-hand",
        "The Quiet Hand",
        "Every secret is already for sale. We only set the price.",
        "An information network operating out of Duskvale. No territory, no army, "
        "and a client list that includes everyone who publicly disavows it.",
    ),
    (
        "coldharrow-archive",
        "Coldharrow Archive",
        "What is remembered is not lost.",
        "Scholars preserving pre-Drowning record. Politically irrelevant until it "
        "became clear they hold the only proof of who owned what.",
    ),
]

# --- Events ----------------------------------------------------------------
# timeline_order is the spine: each event is a consequence of the one before it.
EVENTS = [
    (
        "the-drowning",
        "The Drowning",
        1,
        "The sea rose over a single night and took Ironmere and the low Vale with "
        "it. The survivors who reached high ground became the High Verge; the ones "
        "who did not became Greyfen.",
    ),
    (
        "the-long-winter",
        "The Long Winter",
        2,
        "The first winter after the water. Kestrelwatch closed its granaries to the "
        "lowlands and rode the season out intact. Greyfen did not, and has not "
        "agreed to forget it.",
    ),
    (
        "the-salt-riots",
        "The Salt Riots",
        3,
        "Greyfen rose against Salt Guild pricing after a third consecutive raise. "
        "Four days of burning on the Saltmarch causeway, ended by exhaustion rather "
        "than by any settlement.",
    ),
    (
        "the-verge-compact",
        "The Verge Compact",
        4,
        "A treaty signed at Duskvale binding the Order, the Guild, and the "
        "Tidebinders to shared grain and shared water rights. Brokered by parties "
        "the signatories declined to name in the text.",
    ),
    (
        "the-annex-fire",
        "The Annex Fire",
        5,
        "The Archive's lowland annex at Ironmere burned to the waterline, taking the "
        "pre-Drowning deeds with it. Ruled accidental. The ruling convinced almost "
        "no one.",
    ),
    (
        "the-reckoning",
        "The Reckoning",
        6,
        "The present crisis. With the deeds gone, every Compact claim rests on "
        "testimony, and the Compact is coming apart along the seams the fire left.",
    ),
]

# --- Characters ------------------------------------------------------------
CHARACTERS = [
    (
        "mira-solenne",
        "Mira Solenne",
        ["The Lockkeeper"],
        "alive",
        "Chief engineer of the Tidebinders. Has spent eleven years arguing that the "
        "Vale is recoverable, and is running out of people willing to fund the "
        "argument.",
    ),
    (
        "roderic-kell",
        "Roderic Kell",
        ["Grandmaster Kell"],
        "alive",
        "Grandmaster of the Kestrel Order. Gave the order to close the granaries "
        "during the Long Winter and has never publicly called it anything but "
        "necessary.",
    ),
    (
        "elin-vast",
        "Elin Vast",
        ["Factor Vast"],
        "alive",
        "Senior factor of the Salt Guild. Set the pricing that triggered the Salt "
        "Riots, and negotiated the Compact that followed, without conceding that the "
        "two were connected.",
    ),
    (
        "ivo-marrow",
        "Ivo Marrow",
        ["The Broker"],
        "alive",
        "The Quiet Hand's principal broker at Duskvale. Sold the survey that located "
        "the Archive annex, and maintains this was a cartographic transaction.",
    ),
    (
        "thea-blackwood",
        "Thea Blackwood",
        ["Archivist Blackwood"],
        "alive",
        "Senior archivist at Coldharrow. Lost thirty years of deed reconstruction in "
        "the Annex Fire and has been trying to prove it was set ever since.",
    ),
    (
        "corin-ashe",
        "Corin Ashe",
        [],
        "alive",
        "Mira Solenne's apprentice and the Tidebinders' best surveyor. Has been "
        "passing lock schedules to the Quiet Hand since the Long Winter, for reasons "
        "he no longer finds sufficient.",
    ),
    (
        "garen-coldwater",
        "Garen Coldwater",
        [],
        "alive",
        "A Kestrel Order knight who stood the granary line during the Long Winter "
        "and has been quietly unfit for the Order ever since.",
    ),
    (
        "ondine-marsh",
        "Ondine Marsh",
        ["The Causeway Voice"],
        "alive",
        "Led the Salt Riots from the Greyfen causeway and now sits at the Compact "
        "table as the lowlands' delegate. Left the Tidebinders to do it, and holds "
        "no faction seat by choice.",
    ),
    (
        "osric-dane",
        "Osric Dane",
        [],
        "dead",
        "Salt Guild enforcer, killed on the fourth day of the Salt Riots holding the "
        "Saltmarch causeway. The Guild calls him a casualty; Greyfen calls him the "
        "reason the riots ended.",
    ),
    (
        "lys-fenwick",
        "Lys Fenwick",
        [],
        "unknown",
        "Junior archivist sent to Ironmere to establish how the annex burned. Sent "
        "back two reports, then nothing. The salvage crews have not found the boat.",
    ),
]

# --- Relationships ---------------------------------------------------------
# The API only permits Character-sourced edges of these four types, so the seed
# stays inside that envelope.
LOCATED_IN = [
    ("mira-solenne", "greyfen"),
    ("corin-ashe", "greyfen"),
    ("ondine-marsh", "greyfen"),
    ("roderic-kell", "kestrelwatch"),
    ("garen-coldwater", "kestrelwatch"),
    ("elin-vast", "saltmarch"),
    ("osric-dane", "saltmarch"),
    ("ivo-marrow", "duskvale"),
    ("thea-blackwood", "coldharrow"),
    ("lys-fenwick", "ironmere"),
]

# Ondine Marsh is deliberately unaffiliated — she resigned to take the delegate seat.
MEMBER_OF = [
    ("mira-solenne", "tidebinders"),
    ("corin-ashe", "tidebinders"),
    ("roderic-kell", "kestrel-order"),
    ("garen-coldwater", "kestrel-order"),
    ("elin-vast", "salt-guild"),
    ("osric-dane", "salt-guild"),
    ("ivo-marrow", "quiet-hand"),
    ("thea-blackwood", "coldharrow-archive"),
    ("lys-fenwick", "coldharrow-archive"),
]

PARTICIPATED_IN = [
    ("mira-solenne", "the-drowning"),
    ("roderic-kell", "the-drowning"),
    ("thea-blackwood", "the-drowning"),
    ("roderic-kell", "the-long-winter"),
    ("garen-coldwater", "the-long-winter"),
    ("ondine-marsh", "the-long-winter"),
    ("corin-ashe", "the-long-winter"),
    ("ondine-marsh", "the-salt-riots"),
    ("elin-vast", "the-salt-riots"),
    ("osric-dane", "the-salt-riots"),
    ("corin-ashe", "the-salt-riots"),
    ("roderic-kell", "the-verge-compact"),
    ("elin-vast", "the-verge-compact"),
    ("mira-solenne", "the-verge-compact"),
    ("ondine-marsh", "the-verge-compact"),
    ("ivo-marrow", "the-verge-compact"),
    ("thea-blackwood", "the-annex-fire"),
    ("lys-fenwick", "the-annex-fire"),
    ("ivo-marrow", "the-annex-fire"),
    ("mira-solenne", "the-reckoning"),
    ("roderic-kell", "the-reckoning"),
    ("ondine-marsh", "the-reckoning"),
    ("garen-coldwater", "the-reckoning"),
    ("ivo-marrow", "the-reckoning"),
    ("thea-blackwood", "the-reckoning"),
]

# KNOWS is directed: each side of a pairing carries its own reading of the other.
KNOWS = [
    ("mira-solenne", "corin-ashe", "trusting"),
    ("corin-ashe", "mira-solenne", "guilty"),
    ("mira-solenne", "ondine-marsh", "estranged"),
    ("ondine-marsh", "mira-solenne", "respectful"),
    ("mira-solenne", "roderic-kell", "hostile"),
    ("roderic-kell", "mira-solenne", "dismissive"),
    ("roderic-kell", "garen-coldwater", "suspicious"),
    ("garen-coldwater", "roderic-kell", "disillusioned"),
    ("ondine-marsh", "elin-vast", "hostile"),
    ("elin-vast", "ondine-marsh", "wary"),
    ("osric-dane", "elin-vast", "loyal"),
    ("elin-vast", "osric-dane", "mourning"),
    ("ivo-marrow", "corin-ashe", "transactional"),
    ("corin-ashe", "ivo-marrow", "fearful"),
    ("ivo-marrow", "elin-vast", "cordial"),
    ("elin-vast", "ivo-marrow", "useful"),
    ("thea-blackwood", "lys-fenwick", "worried"),
    ("lys-fenwick", "thea-blackwood", "devoted"),
    ("thea-blackwood", "ivo-marrow", "accusing"),
    ("ivo-marrow", "thea-blackwood", "evasive"),
    ("garen-coldwater", "ondine-marsh", "sympathetic"),
    ("ondine-marsh", "garen-coldwater", "cautious"),
    ("roderic-kell", "elin-vast", "allied"),
    ("elin-vast", "roderic-kell", "allied"),
    ("ivo-marrow", "roderic-kell", "watchful"),
]
