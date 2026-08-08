from neo4j import AsyncDriver

CONSTRAINTS = [
    "CREATE CONSTRAINT character_id IF NOT EXISTS FOR (c:Character) REQUIRE c.id IS UNIQUE",
    "CREATE CONSTRAINT location_id  IF NOT EXISTS FOR (l:Location)  REQUIRE l.id IS UNIQUE",
    "CREATE CONSTRAINT faction_id   IF NOT EXISTS FOR (f:Faction)   REQUIRE f.id IS UNIQUE",
    "CREATE CONSTRAINT event_id     IF NOT EXISTS FOR (e:Event)     REQUIRE e.id IS UNIQUE",
    # Authentication
    "CREATE CONSTRAINT user_email IF NOT EXISTS FOR (u:User) REQUIRE u.email IS UNIQUE",
]

INDEXES = [
    "CREATE INDEX character_name IF NOT EXISTS FOR (c:Character) ON (c.name)",
    "CREATE INDEX location_name  IF NOT EXISTS FOR (l:Location)  ON (l.name)",
    "CREATE INDEX faction_name   IF NOT EXISTS FOR (f:Faction)   ON (f.name)",
]


async def run_migrations(driver: AsyncDriver) -> None:
    async with driver.session() as session:
        for stmt in CONSTRAINTS + INDEXES:
            await session.run(stmt)  # type: ignore[arg-type]
