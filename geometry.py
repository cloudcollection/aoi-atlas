import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from shapely.geometry import shape, mapping, Point
from shapely.geometry.polygon import orient
from shapely.validation import explain_validity

PROVIDERS = {"gaode": "高德地图", "baidu": "百度地图", "tencent": "腾讯地图"}
_core = (Path(__file__).parent / "aoiCollectorJs" / "core.js").read_text(
    encoding="utf-8-sig"
)
MC_COEFF = json.loads(
    re.search(r"const MC_COEFF\s*=\s*(\[.*?\]);", _core, re.S).group(1)
)
TYPECODE_MAP = json.loads(
    re.search(
        r"const TYPECODE_MAP\s*=\s*(\{.*?\});",
        (
            Path(__file__).parent / "aoiCollectorJs" / "libs" / "typecode_map.js"
        ).read_text(encoding="utf-8-sig"),
        re.S,
    ).group(1)
)
MC_BANDS = [12890594.86, 8362377.87, 5591021, 3481989.83, 1678043.12, 0]


def pair(p):
    if (
        not isinstance(p, (list, tuple))
        or len(p) != 2
        or any(
            isinstance(v, bool)
            or not isinstance(v, (int, float))
            or not math.isfinite(v)
            for v in p
        )
    ):
        raise ValueError("坐标必须是两个有限数值")
    return list(p)


def mc_to_bd(p):
    x, y = pair(p)
    if abs(x) > 21000000 or abs(y) > 20000000:
        raise ValueError("百度墨卡托坐标超出范围")
    c = MC_COEFF[next(i for i, b in enumerate(MC_BANDS) if abs(y) >= b)]
    t = abs(y) / c[9]
    return [
        (c[0] + c[1] * abs(x)) * (-1 if x < 0 else 1),
        sum(c[i] * t ** (i - 2) for i in range(2, 9)) * (-1 if y < 0 else 1),
    ]


def outside(x, y):
    return x < 72.004 or x > 137.8347 or y < 0.8293 or y > 55.8271


def wgs_to_gcj(p):
    x, y = pair(p)
    if outside(x, y):
        return [x, y]
    a, b, pi = x - 105, y - 35, math.pi
    dy = -100 + 2 * a + 3 * b + 0.2 * b * b + 0.1 * a * b + 0.2 * math.sqrt(abs(a))
    dy += (20 * math.sin(6 * a * pi) + 20 * math.sin(2 * a * pi)) * 2 / 3
    dy += (20 * math.sin(b * pi) + 40 * math.sin(b / 3 * pi)) * 2 / 3
    dy += (160 * math.sin(b / 12 * pi) + 320 * math.sin(b * pi / 30)) * 2 / 3
    dx = 300 + a + 2 * b + 0.1 * a * a + 0.1 * a * b + 0.1 * math.sqrt(abs(a))
    dx += (20 * math.sin(6 * a * pi) + 20 * math.sin(2 * a * pi)) * 2 / 3
    dx += (20 * math.sin(a * pi) + 40 * math.sin(a / 3 * pi)) * 2 / 3
    dx += (150 * math.sin(a / 12 * pi) + 300 * math.sin(a / 30 * pi)) * 2 / 3
    rad = y * pi / 180
    m = 1 - 0.00669342162296594323 * math.sin(rad) ** 2
    s = math.sqrt(m)
    return [
        x + dx * 180 / (6378245 / s * math.cos(rad) * pi),
        y + dy * 180 / (6378245 * (1 - 0.00669342162296594323) / (m * s) * pi),
    ]


def gcj_to_wgs(p):
    x, y = pair(p)
    if outside(x, y):
        return [x, y]
    q = [x, y]
    for _ in range(8):
        g = wgs_to_gcj(q)
        dx, dy = g[0] - x, g[1] - y
        q = [q[0] - dx, q[1] - dy]
        if max(abs(dx), abs(dy)) < 1e-10:
            break
    return q


def bd_to_gcj(p):
    x, y = pair(p)
    x -= 0.0065
    y -= 0.006
    k = math.pi * 3000 / 180
    z = math.hypot(x, y) - 0.00002 * math.sin(y * k)
    t = math.atan2(y, x) - 0.000003 * math.cos(x * k)
    return [z * math.cos(t), z * math.sin(t)]


def to_wgs(p, crs):
    p = pair(p)
    if crs == "BD09MC":
        p = mc_to_bd(p)
    if crs in ("BD09MC", "BD09LL"):
        p = bd_to_gcj(p)
    if crs in ("GCJ02", "BD09MC", "BD09LL"):
        p = gcj_to_wgs(p)
    elif crs != "WGS84":
        raise ValueError("不支持的坐标系")
    if abs(p[0]) > 180 or abs(p[1]) > 90:
        raise ValueError("经纬度超出范围")
    return p


def map_geometry(g, fn):
    if not isinstance(g, dict):
        raise ValueError("该地点未返回边界")
    t, c = g.get("type"), g.get("coordinates")
    if t == "Point":
        return {"type": t, "coordinates": fn(c)}
    if t not in ("Polygon", "MultiPolygon"):
        raise ValueError("不支持的几何类型")
    polys = [c] if t == "Polygon" else c
    if not isinstance(polys, list) or not 0 < len(polys) <= 100:
        raise ValueError("多边形为空或数量过多")
    out = []
    total = 0
    for poly in polys:
        if not isinstance(poly, list) or not 0 < len(poly) <= 100:
            raise ValueError("缺少外环")
        rings = []
        for ring in poly:
            if not isinstance(ring, list) or not 3 <= len(ring) <= 10000:
                raise ValueError("边界点数无效")
            total += len(ring)
            if total > 20000:
                raise ValueError("边界总点数过多")
            pts = [fn(p) for p in ring]
            if pts[0] != pts[-1]:
                pts.append(pts[0][:])
            if len(set(map(tuple, pts))) < 3:
                raise ValueError("边界至少需要三个不同顶点")
            rings.append(pts)
        out.append(rings)
    return {"type": t, "coordinates": out[0] if t == "Polygon" else out}


def text(v, maxlen=500):
    return str(v if v is not None else "")[:maxlen]


def normalize(c):
    if not isinstance(c, dict) or c.get("provider") not in PROVIDERS:
        raise ValueError("未知地图来源")
    provider = c["provider"]
    pid = text(c.get("poiid"), 160)
    name = text(c.get("name"), 250)
    crs = c.get("source_crs")
    if not pid or not name:
        raise ValueError("缺少地点名称或ID")
    if crs not in ("WGS84", "GCJ02", "BD09LL", "BD09MC"):
        raise ValueError("缺少有效源坐标系")
    source = c.get("source_geometry")
    if not source:
        raise ValueError("该地点未返回边界，请搜索并点击具体地点")
    if provider == "tencent" and source.get("type") != "Point":
        raise ValueError("腾讯 AOI 尚未验证，当前仅支持地点记录")
    if provider != "tencent" and source.get("type") == "Point":
        raise ValueError("中心点不能作为AOI保存")
    geo = map_geometry(source, lambda p: to_wgs(p, crs))
    geom = shape(geo)
    if geom.is_empty or not geom.is_valid:
        raise ValueError("边界几何无效：" + explain_validity(geom))
    if geom.geom_type == "Polygon":
        geo = json.loads(json.dumps(mapping(orient(geom, sign=1))))
    elif geom.geom_type == "MultiPolygon":
        geo = {
            "type": "MultiPolygon",
            "coordinates": [
                json.loads(json.dumps(mapping(orient(p, sign=1))))["coordinates"]
                for p in geom.geoms
            ],
        }
    center = to_wgs(c.get("source_center"), crs)
    warnings = []
    quality = c.get("source_quality") or {}
    precise = quality.get("is_precise")
    precise = precise if type(precise) is int and precise in (0, 1) else None
    if precise == 0:
        warnings.append("来源标记为非精确边界，请核实")
    if provider == "tencent":
        if max(abs(a - b) for a, b in zip(center, geo["coordinates"])) > 1e-10:
            raise ValueError("地点中心与来源坐标不一致")
        warnings.append("腾讯实验支持：仅保存地点信息，不含AOI边界")
    elif not geom.covers(Point(center)):
        warnings.append("中心点不在边界内，请核实地点关联")
    return dict(
        schema_version=2,
        id=provider + ":" + pid,
        provider=provider,
        poiid=pid,
        name=name,
        address=text(c.get("address")),
        address_detail=text(c.get("address_detail")),
        city=text(c.get("city"), 100),
        typecode=text(c.get("typecode"), 100),
        source_crs=crs,
        source_geometry=source,
        source_center=pair(c.get("source_center")),
        source_quality={"is_precise": precise},
        source_field=text(c.get("source_field"), 160),
        raw_boundary=text(c.get("raw_boundary"), 1000000),
        geometry=geo,
        center=center,
        lng=center[0],
        lat=center[1],
        kind="poi" if geom.geom_type == "Point" else "aoi",
        warnings=warnings,
        created_at=datetime.now(timezone.utc).isoformat(),
    )


def feature(r):
    return {
        "type": "Feature",
        "id": r["id"],
        "properties": {
            "NAME": r["name"],
            "PROVIDER": r["provider"],
            "POIID": r["poiid"],
            "ADDRESS": r["address"],
            "ADDRESS_POIINFO": r["address"],
            "TYPECODE": r.get("typecode", ""),
            "BIG_CATEGORY": (r.get("categories") or {}).get("big", ""),
            "MID_CATEGORY": (r.get("categories") or {}).get("mid", ""),
            "SUB_CATEGORY": (r.get("categories") or {}).get("sub", ""),
            "ADDRESS_DETAIL": r.get("address_detail", ""),
            "CITY_NAME": r["city"],
            "LONGITUDE": r["center"][0],
            "LATITUDE": r["center"][1],
            "KIND": r["kind"],
            "SOURCE_CRS": r["source_crs"],
            "SOURCE_PRECISE": r["source_quality"].get("is_precise"),
            "WARNINGS": "；".join(r["warnings"]),
            "CREATED_AT": r["created_at"],
        },
        "geometry": r["geometry"],
    }
