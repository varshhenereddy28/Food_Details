from pathlib import Path
import os
import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://food:food@localhost:5434/food")
MIGRATIONS = sorted(Path(__file__).parent.joinpath("migrations").glob("*.sql"))

with psycopg.connect(DATABASE_URL) as connection:
    for migration in MIGRATIONS:
        connection.execute(migration.read_text(encoding="utf-8"))
        print(f"Applied {migration.name}")
