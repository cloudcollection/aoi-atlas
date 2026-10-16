import importlib
import json
import sqlite3
import subprocess
from pathlib import Path
import pytest
import shapefile
from fastapi.testclient import TestClient
from shapely.geometry import shape
import geometry
import storage
import app as web

FIXTURES = json.loads(
    (Path(__file__).parent / "fixtures" / "baidu.json").read_text(encoding="utf-8")
)


def gaode(pid="same"):
    return {
        "provider": "gaode",
        "poiid": pid,
        "name": "同名医院",
        "source_crs": "GCJ02",
        "source_center": [116.33, 40.01],
        "source_geometry": {
            "type": "Polygon",
            "coordinates": [
                [[116.32, 40], [116.34, 40], [116.34, 40.02], [116.32, 40.02]]
            ],
        },
    }


@pytest.fixture
def store(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA", tmp_path / "data")
    monkeypatch.setattr(storage, "OUTPUT", tmp_path / "data" / "output")
    monkeypatch.setattr(storage, "DB_PATH", tmp_path / "data" / "aoi.sqlite")
    monkeypatch.setattr(storage, "TEMP", tmp_path / "temp")
    storage.init_db()
    return storage


def test_real_samples_projection_and_python_javascript_parity():
    repo = Path(__file__).resolve().parents[1]
    script = "const C=require('./aoiCollectorJs/core.js');process.stdout.write(JSON.stringify(require('./tests/fixtures/baidu.json').map(f=>C.normalize(f.candidate))));"
    js = json.loads(
        subprocess.check_output(
            ["node", "-e", script], cwd=repo, text=True, encoding="utf-8"
        )
    )
    for fixture, other in zip(FIXTURES, js):
        r = geometry.normalize(fixture["candidate"])
        assert shape(r["geometry"]).is_valid
        assert shape(r["geometry"]).covers(
            shape({"type": "Point", "coordinates": r["center"]})
        )
        assert r["warnings"] == other["warnings"]
        assert max(abs(a - b) for a, b in zip(r["center"], other["center"])) < 1e-10
        assert all(
            max(abs(a - b) for a, b in zip(p, q)) < 1e-10
            for p, q in zip(
                r["geometry"]["coordinates"][0], other["geometry"]["coordinates"][0]
            )
        )
        assert geometry.mc_to_bd(
            fixture["candidate"]["source_geometry"]["coordinates"][0][0]
        ) == pytest.approx(fixture["expected_bd09ll_first"], abs=1e-9)


def test_same_name_ids_update_retains_old_files_and_soft_delete(store):
    a = store.save(gaode("a"))
    b = store.save(gaode("b"))
    assert len(store.list_records()) == 2
    old = store.folder_for(a["id"])
    store.save(gaode("a"))
    assert old.exists()
    assert old != store.folder_for(a["id"])
    assert store.delete(a["id"])
    assert not store.get_record(a["id"])
    assert old.exists()
    assert store.get_record(b["id"])


def test_shapefile_geojson_center_holes_unicode_and_source_precision(store):
    c = gaode()
    c.update(
        name="医院名字" * 90,
        source_crs="WGS84",
        source_center=[0.5, 0.5],
        source_geometry={
            "type": "Polygon",
            "coordinates": [
                [[0, 0], [4, 0], [4, 4], [0, 4]],
                [[1, 1], [1, 2], [2, 2], [2, 1]],
            ],
        },
    )
    r = store.save(c)
    folder = store.folder_for(r["id"])
    reader = shapefile.Reader(str(folder / "boundary.shp"), encoding="utf-8")
    exported = shape(reader.shape(0).__geo_interface__)
    assert exported.is_valid
    assert exported.area == pytest.approx(15)
    reader.record(0)[0].encode("utf-8")
    gj = json.loads((folder / "boundary.geojson").read_text(encoding="utf-8"))
    assert shape(gj["features"][0]["geometry"]).equals(exported)
    assert (folder / "boundary.cpg").read_text() == "UTF-8"
    for f in FIXTURES:
        r = store.save(f["candidate"])
        assert r["source_quality"] == f["candidate"]["source_quality"]


def test_failed_export_preserves_record_and_previous_outputs(store, monkeypatch):
    r = store.save(gaode())
    before = store.get_record(r["id"])
    folder = store.folder_for(r["id"])
    monkeypatch.setattr(
        store,
        "write_outputs",
        lambda *a: (_ for _ in ()).throw(OSError("disk failure")),
    )
    with pytest.raises(OSError):
        store.save(gaode())
    assert store.get_record(r["id"]) == before
    assert (folder / "record.json").exists()
    assert list(store.TEMP.iterdir()) == []


def test_legacy_migration_preserves_old_table_and_reports_bad_rows(
    tmp_path, monkeypatch
):
    dbpath = tmp_path / "aoi.sqlite"
    with sqlite3.connect(dbpath) as db:
        db.execute(
            "CREATE TABLE aoi(poiid TEXT,name TEXT,address TEXT,city TEXT,lng REAL,lat REAL,coords TEXT,folder TEXT,created_at TEXT)"
        )
        db.execute(
            "INSERT INTO aoi VALUES(?,?,?,?,?,?,?,?,?)",
            (
                "old",
                "旧医院",
                "地址",
                "北京",
                116.33,
                40.01,
                "116.32,40;116.34,40;116.34,40.02;116.32,40.02",
                "/outside-user-files",
                "2020",
            ),
        )
        db.execute(
            "INSERT INTO aoi VALUES(?,?,?,?,?,?,?,?,?)",
            ("bad", "坏记录", "", "", 0, 0, "bad", "", "2020"),
        )
    for k, v in {
        "DATA": tmp_path,
        "OUTPUT": tmp_path / "output",
        "DB_PATH": dbpath,
        "TEMP": tmp_path / "temp",
    }.items():
        monkeypatch.setattr(storage, k, v)
    storage.init_db()
    assert len(storage.list_records()) == 1
    assert len(storage.migration_status()["failures"]) == 1
    with sqlite3.connect(dbpath) as db:
        assert db.execute("SELECT count(*) FROM aoi").fetchone()[0] == 2
    storage.init_db()
    assert len(storage.list_records()) == 1
    assert storage.folder_for("gaode:old") is None


def test_api_rejects_cross_site_and_bad_geometry_exports_real_files(store):
    with TestClient(web.app) as client:
        assert (
            client.post(
                "/api/report",
                json=gaode(),
                headers={"Origin": "https://untrusted.example"},
            ).status_code
            == 403
        )
        assert (
            client.post(
                "/api/report", json={**gaode(), "source_geometry": None}
            ).status_code
            == 400
        )
        res = client.post("/api/report", json=FIXTURES[1]["candidate"])
        assert res.status_code == 200
        record_id = res.json()["id"]
        assert client.get("/api/files/" + record_id).content[:2] == b"PK"
        assert (
            client.get("/api/export").json()["features"][0]["geometry"]["coordinates"][
                0
            ][0]
            == client.get("/api/export").json()["features"][0]["geometry"][
                "coordinates"
            ][0][-1]
        )
        assert client.delete("/api/records/" + record_id).json()["ok"]
        assert client.get("/api/detail", params={"id": record_id}).status_code == 404


def test_invalid_multipolygon_and_tencent_polygon_rejected():
    c = gaode()
    c["provider"] = "tencent"
    with pytest.raises(ValueError, match="尚未验证"):
        geometry.normalize(c)
    c = gaode()
    c["source_geometry"] = {
        "type": "Polygon",
        "coordinates": [[[0, 0], [1, 1], [0, 1], [1, 0]]],
    }
    c["source_crs"] = "WGS84"
    with pytest.raises(ValueError):
        geometry.normalize(c)


def test_live_gaode_boundary_export_matches_javascript(store):
    repo = Path(__file__).resolve().parents[1]
    script = "const C=require('./aoiCollectorJs/core.js'),f=require('./tests/fixtures/gaode.json');process.stdout.write(JSON.stringify(C.normalize(C.parseResponse('gaode','https://www.amap.com'+f.path,{data:{poi_list:[f.poi]}}).candidates[0])));"
    candidate = json.loads(
        subprocess.check_output(
            ["node", "-e", script], cwd=repo, text=True, encoding="utf-8"
        )
    )
    r = store.save(candidate)
    assert r["id"] == "gaode:B00140226E"
    assert r["typecode"] == "090101"
    assert len(r["geometry"]["coordinates"][0]) == 44
    assert shape(r["geometry"]).equals_exact(shape(candidate["geometry"]), 1e-10)
    assert shape(r["geometry"]).covers(
        shape({"type": "Point", "coordinates": r["center"]})
    )
    exported = shapefile.Reader(
        str(store.folder_for(r["id"]) / "boundary.shp"), encoding="utf-8"
    )
    assert shape(exported.shape(0).__geo_interface__).equals(shape(r["geometry"]))


def test_tencent_live_landmark_point_and_source_attributes_roundtrip(store):
    repo = Path(__file__).resolve().parents[1]
    script = "const C=require('./aoiCollectorJs/core.js'),f=require('./tests/fixtures/tencent.json').detail;process.stdout.write(JSON.stringify(C.normalize(C.parseResponse('tencent',f.url,f.data).candidates[0])));"
    candidate = json.loads(
        subprocess.check_output(
            ["node", "-e", script], cwd=repo, text=True, encoding="utf-8"
        )
    )
    r = store.save(candidate)
    assert r["id"] == "tencent:13178396489244734153"
    assert r["geometry"]["type"] == "Point"
    assert r["source_attributes"] == candidate["source_attributes"]
    assert geometry.feature(r)["properties"]["CATEGORY"] == "旅游景点:公园"
    reader = shapefile.Reader(
        str(store.folder_for(r["id"]) / "boundary.shp"), encoding="utf-8"
    )
    assert reader.shapeType == 1
    assert shape(reader.shape(0).__geo_interface__).equals_exact(
        shape(candidate["geometry"]), 1e-10
    )
