import hashlib
import json
import os
import sqlite3
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
import shapefile
from geometry import normalize, feature, gcj_to_wgs, TYPECODE_MAP

BASE = Path(__file__).resolve().parent
DATA = Path(os.environ.get("AOI_DATA_DIR", str(BASE))).resolve()
OUTPUT = DATA / "output"
DB_PATH = DATA / "aoi.sqlite"
TEMP = Path(os.environ.get("AOI_TEMP_DIR", str(BASE / ".runtime"))).resolve()
_LOCK = threading.RLock()
PRJ = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'


def init_db():
    DATA.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(exist_ok=True)
    TEMP.mkdir(parents=True, exist_ok=True)
    with _LOCK, sqlite3.connect(DB_PATH) as db:
        db.execute(
            "CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, payload TEXT NOT NULL, folder TEXT, deleted_at TEXT)"
        )
        db.execute("CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT)")
        if (
            db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='aoi'"
            ).fetchone()
            and not db.execute("SELECT 1 FROM meta WHERE key='migration_v2'").fetchone()
        ):
            db.row_factory = sqlite3.Row
            failures = []
            for old in db.execute("SELECT * FROM aoi").fetchall():
                a = dict(old)
                try:
                    pts = [
                        [float(v) for v in p.split(",")]
                        for p in a["coords"].split(";")
                        if p
                    ]
                    c = {
                        "provider": "gaode",
                        "poiid": a["poiid"],
                        "name": a["name"],
                        "address": a.get("address", ""),
                        "city": a.get("city", ""),
                        "source_crs": "WGS84",
                        "source_geometry": {"type": "Polygon", "coordinates": [pts]},
                        "source_center": gcj_to_wgs([a["lng"], a["lat"]]),
                        "source_field": "legacy.coords_wgs84",
                    }
                    r = normalize(c)
                    r["created_at"] = a.get("created_at") or r["created_at"]
                    r["warnings"].append("从旧版记录迁移，建议核实中心坐标")
                    db.execute(
                        "INSERT OR IGNORE INTO records(id,payload,folder) VALUES(?,?,?)",
                        (r["id"], json.dumps(r, ensure_ascii=False), a.get("folder")),
                    )
                except Exception as e:
                    failures.append({"poiid": a.get("poiid"), "error": str(e)})
            db.execute(
                "INSERT INTO meta VALUES(?,?)",
                (
                    "migration_v2",
                    json.dumps(
                        {"failures": failures, "legacyPreserved": True},
                        ensure_ascii=False,
                    ),
                ),
            )


def list_records():
    with _LOCK, sqlite3.connect(DB_PATH) as db:
        return [
            json.loads(p[0])
            for p in db.execute(
                "SELECT payload FROM records WHERE deleted_at IS NULL ORDER BY rowid DESC"
            )
        ]


def get_record(record_id):
    with _LOCK, sqlite3.connect(DB_PATH) as db:
        row = db.execute(
            "SELECT payload FROM records WHERE id=? AND deleted_at IS NULL",
            (record_id,),
        ).fetchone()
        return json.loads(row[0]) if row else None


def migration_status():
    with _LOCK, sqlite3.connect(DB_PATH) as db:
        row = db.execute("SELECT value FROM meta WHERE key='migration_v2'").fetchone()
        return json.loads(row[0]) if row else {"failures": []}


def write_outputs(r, directory):
    base = directory / "boundary"
    g = r["geometry"]
    writer = shapefile.Writer(
        str(base),
        shapeType=shapefile.POINT if g["type"] == "Point" else shapefile.POLYGON,
        encoding="utf-8",
    )
    writer.field("NAME", "C", size=250)
    writer.field("PROVIDER", "C", size=16)
    writer.field("POIID", "C", size=160)
    writer.field("ADDRESS", "C", size=250)
    writer.field("CITY_NAME", "C", size=100)
    writer.field("LONGITUDE", "F", size=18, decimal=9)
    writer.field("LATITUDE", "F", size=18, decimal=9)
    writer.field("PRECISE", "N", size=2)
    if g["type"] == "Point":
        writer.point(*g["coordinates"])
    else:
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        # Shapefile exterior rings use clockwise order; GeoJSON uses counter-clockwise.
        writer.poly([list(reversed(ring)) for poly in polys for ring in poly])
    clip = (
        lambda text, n: str(text).encode("utf-8")[:n].decode("utf-8", errors="ignore")
    )
    writer.record(
        clip(r["name"], 250),
        r["provider"],
        clip(r["poiid"], 160),
        clip(r["address"], 250),
        clip(r["city"], 100),
        *r["center"],
        r["source_quality"].get("is_precise")
    )
    writer.close()
    base.with_suffix(".prj").write_text(PRJ, encoding="utf-8")
    base.with_suffix(".cpg").write_text("UTF-8", encoding="ascii")
    base.with_suffix(".geojson").write_text(
        json.dumps(
            {"type": "FeatureCollection", "features": [feature(r)]},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    (directory / "record.json").write_text(
        json.dumps(r, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (directory / "说明.txt").write_text(
        "\n".join(
            [
                r["name"],
                "来源：" + r["provider"],
                "地点ID：" + r["poiid"],
                "原始坐标系：" + r["source_crs"],
                "导出坐标系：WGS84（近似转换）",
                "；".join(r["warnings"]),
            ]
        ),
        encoding="utf-8",
    )


def save(candidate):
    r = normalize(candidate)
    if r["provider"] == "gaode":
        key = r["typecode"]
        r["categories"] = TYPECODE_MAP.get(key) or TYPECODE_MAP.get(
            str(int(key)) if key.isdecimal() else key
        )
    with _LOCK:
        key = hashlib.sha256(r["id"].encode()).hexdigest()[:24]
        target = OUTPUT / r["provider"] / key / uuid.uuid4().hex
        target.parent.mkdir(parents=True, exist_ok=True)
        stage = Path(tempfile.mkdtemp(prefix="aoi-export-", dir=TEMP))
        try:
            write_outputs(r, stage)
            os.replace(stage, target)
            with sqlite3.connect(DB_PATH) as db:
                db.execute(
                    "INSERT INTO records(id,payload,folder,deleted_at) VALUES(?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,folder=excluded.folder,deleted_at=NULL",
                    (
                        r["id"],
                        json.dumps(r, ensure_ascii=False),
                        str(target.relative_to(DATA)),
                    ),
                )
        finally:
            # Only remove this app-created empty staging directory, never an existing output.
            if stage.exists() and stage.resolve().is_relative_to(TEMP):
                import shutil

                shutil.rmtree(stage)
    return r


def delete(record_id):
    with _LOCK, sqlite3.connect(DB_PATH) as db:
        cur = db.execute(
            "UPDATE records SET deleted_at=? WHERE id=? AND deleted_at IS NULL",
            (datetime.now(timezone.utc).isoformat(), record_id),
        )
        return cur.rowcount > 0


def folder_for(record_id):
    with _LOCK, sqlite3.connect(DB_PATH) as db:
        row = db.execute(
            "SELECT folder FROM records WHERE id=? AND deleted_at IS NULL", (record_id,)
        ).fetchone()
    if not row or not row[0]:
        return None
    p = (DATA / row[0]).resolve()
    # Old legacy folders are never traversed or exported through this endpoint.
    if not p.is_relative_to(OUTPUT.resolve()) or not p.is_dir():
        return None
    return p
