import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session")
def shared():
    return {
        "profit": json.loads((ROOT / "shared/profit_vectors.json").read_text(encoding="utf-8")),
        "ids": json.loads((ROOT / "shared/identifier_vectors.json").read_text(encoding="utf-8")),
    }


@pytest.fixture()
def db():
    """Yalnızca TEST_DATABASE_URL tanımlıysa çalışır; şemayı her testte sıfırdan kurar."""
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL tanımlı değil")
    import psycopg

    assert "test" in url, "Güvenlik: TEST_DATABASE_URL adı 'test' içermeli (gerçek veritabanını silmemek için)"
    with psycopg.connect(url, autocommit=True) as c:
        c.execute("drop schema public cascade; create schema public;")
    subprocess.run([str(ROOT / "db/migrate.sh")], env={**os.environ, "DATABASE_URL": url}, check=True,
                   capture_output=True)
    with psycopg.connect(url) as c:
        yield c
