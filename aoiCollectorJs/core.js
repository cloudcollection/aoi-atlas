(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AOICore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";
  const PROVIDERS = {
    gaode: { name: "高德地图", url: "https://www.amap.com/", aoi: true },
    baidu: { name: "百度地图", url: "https://map.baidu.com/", aoi: true },
    tencent: { name: "腾讯地图", url: "https://map.qq.com/", aoi: false }
  };
  const MC_BANDS = [
    12890594.86, 8362377.87, 5591021, 3481989.83, 1678043.12, 0
  ];
  const MC_COEFF = [
    [
      1.410526172116255e-8, 8.98305509648872e-6, -1.9939833816331,
      200.9824383106796, -187.2403703815547, 91.6087516669843,
      -23.38765649603339, 2.57121317296198, -0.03801003308653, 17337981.2
    ],
    [
      -7.435856389565537e-9, 8.983055097726239e-6, -0.78625201886289,
      96.32687599759846, -1.85204757529826, -59.36935905485877,
      47.40033549296737, -16.50741931063887, 2.28786674699375, 10260144.86
    ],
    [
      -3.030883460898826e-8, 8.98305509983578e-6, 0.30071316287616,
      59.74293618442277, 7.357984074871, -25.38371002664745, 13.45380521110908,
      -3.29883767235584, 0.32710905363475, 6856817.37
    ],
    [
      -1.981981304930552e-8, 8.983055099779535e-6, 0.03278182852591,
      40.31678527705744, 0.65659298677277, -4.44255534477492, 0.85341911805263,
      0.12923347998204, -0.04625736007561, 4482777.06
    ],
    [
      3.09191371068437e-9, 8.983055096812155e-6, 0.00006995724062,
      23.10934304144901, -0.00023663490511, -0.6321817810242, -0.00663494467273,
      0.03430082397953, -0.00466043876332, 2555164.4
    ],
    [
      2.890871144776878e-9, 8.983055095805407e-6, -3.068298e-8,
      7.47137025468032, -0.00000353937994, -0.02145144861037, -0.00001234426596,
      0.00010322952773, -0.00000323890364, 826088.5
    ]
  ];
  function providerFor(url) {
    try {
      const h = new URL(url).hostname;
      if (
        h === "gaode.com" ||
        h.endsWith(".gaode.com") ||
        h === "amap.com" ||
        h.endsWith(".amap.com")
      )
        return "gaode";
      if (h === "map.baidu.com") return "baidu";
      if (h === "map.qq.com") return "tencent";
    } catch {}
    return null;
  }
  function pair(p) {
    if (
      !Array.isArray(p) ||
      p.length !== 2 ||
      p.some((x) => typeof x !== "number" || !Number.isFinite(x))
    )
      throw Error("坐标必须是两个有限数值");
    return p.slice();
  }
  function mcToBd(p) {
    let [x, y] = pair(p);
    if (Math.abs(x) > 21000000 || Math.abs(y) > 20000000)
      throw Error("百度墨卡托坐标超出范围");
    const c = MC_COEFF[MC_BANDS.findIndex((b) => Math.abs(y) >= b)];
    let lat = 0,
      t = Math.abs(y) / c[9];
    for (let i = 2; i <= 8; i++) lat += c[i] * t ** (i - 2);
    return [
      (c[0] + c[1] * Math.abs(x)) * (x < 0 ? -1 : 1),
      lat * (y < 0 ? -1 : 1)
    ];
  }
  function outside(x, y) {
    return x < 72.004 || x > 137.8347 || y < 0.8293 || y > 55.8271;
  }
  function wgsToGcj(p) {
    let [x, y] = pair(p);
    if (outside(x, y)) return [x, y];
    let a = x - 105,
      b = y - 35,
      pi = Math.PI;
    let dy =
      -100 +
      2 * a +
      3 * b +
      0.2 * b * b +
      0.1 * a * b +
      0.2 * Math.sqrt(Math.abs(a));
    dy += ((20 * Math.sin(6 * a * pi) + 20 * Math.sin(2 * a * pi)) * 2) / 3;
    dy += ((20 * Math.sin(b * pi) + 40 * Math.sin((b / 3) * pi)) * 2) / 3;
    dy +=
      ((160 * Math.sin((b / 12) * pi) + 320 * Math.sin((b * pi) / 30)) * 2) / 3;
    let dx =
      300 +
      a +
      2 * b +
      0.1 * a * a +
      0.1 * a * b +
      0.1 * Math.sqrt(Math.abs(a));
    dx += ((20 * Math.sin(6 * a * pi) + 20 * Math.sin(2 * a * pi)) * 2) / 3;
    dx += ((20 * Math.sin(a * pi) + 40 * Math.sin((a / 3) * pi)) * 2) / 3;
    dx +=
      ((150 * Math.sin((a / 12) * pi) + 300 * Math.sin((a / 30) * pi)) * 2) / 3;
    const rad = (y * pi) / 180,
      m = 1 - 0.00669342162296594323 * Math.sin(rad) ** 2,
      s = Math.sqrt(m);
    return [
      x + (dx * 180) / ((6378245 / s) * Math.cos(rad) * pi),
      y +
        (dy * 180) / (((6378245 * (1 - 0.00669342162296594323)) / (m * s)) * pi)
    ];
  }
  function gcjToWgs(p) {
    const [x, y] = pair(p);
    if (outside(x, y)) return [x, y];
    let q = [x, y];
    for (let i = 0; i < 8; i++) {
      const g = wgsToGcj(q),
        dx = g[0] - x,
        dy = g[1] - y;
      q = [q[0] - dx, q[1] - dy];
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 1e-10) break;
    }
    return q;
  }
  function bdToGcj(p) {
    let [x, y] = pair(p);
    x -= 0.0065;
    y -= 0.006;
    const k = (Math.PI * 3000) / 180,
      z = Math.hypot(x, y) - 0.00002 * Math.sin(y * k),
      t = Math.atan2(y, x) - 0.000003 * Math.cos(x * k);
    return [z * Math.cos(t), z * Math.sin(t)];
  }
  function toWgs(p, crs) {
    p = pair(p);
    if (crs === "BD09MC") p = mcToBd(p);
    if (crs === "BD09MC" || crs === "BD09LL") p = bdToGcj(p);
    if (["GCJ02", "BD09MC", "BD09LL"].includes(crs)) p = gcjToWgs(p);
    else if (crs !== "WGS84") throw Error("不支持的坐标系");
    if (Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)
      throw Error("经纬度超出范围");
    return p;
  }
  function same(a, b) {
    return a[0] === b[0] && a[1] === b[1];
  }
  function cross(a, b, c) {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  }
  function on(a, b, p) {
    return (
      Math.abs(cross(a, b, p)) < 1e-14 &&
      p[0] >= Math.min(a[0], b[0]) - 1e-12 &&
      p[0] <= Math.max(a[0], b[0]) + 1e-12 &&
      p[1] >= Math.min(a[1], b[1]) - 1e-12 &&
      p[1] <= Math.max(a[1], b[1]) + 1e-12
    );
  }
  function intersect(a, b, c, d) {
    const x = cross(a, b, c),
      y = cross(a, b, d),
      z = cross(c, d, a),
      w = cross(c, d, b);
    return (
      (x * y < 0 && z * w < 0) ||
      on(a, b, c) ||
      on(a, b, d) ||
      on(c, d, a) ||
      on(c, d, b)
    );
  }
  function area(r) {
    const o = r[0];
    let s = 0;
    for (let i = 0; i < r.length - 1; i++)
      s +=
        (r[i][0] - o[0]) * (r[i + 1][1] - o[1]) -
        (r[i + 1][0] - o[0]) * (r[i][1] - o[1]);
    return s / 2;
  }
  function inside(p, r) {
    let yes = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i],
        b = r[j];
      if (on(a, b, p)) return true;
      if (
        a[1] > p[1] !== b[1] > p[1] &&
        p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
      )
        yes = !yes;
    }
    return yes;
  }
  function cleanRing(input) {
    if (!Array.isArray(input) || input.length > 10000)
      throw Error("边界为空或点数过多");
    const r = [];
    for (const p of input) {
      const q = pair(p);
      if (!r.length || !same(q, r[r.length - 1])) r.push(q);
    }
    if (r.length && same(r[0], r[r.length - 1])) r.pop();
    if (new Set(r.map((p) => p.join(","))).size < 3)
      throw Error("边界至少需要三个不同顶点");
    r.push(r[0].slice());
    if (Math.abs(area(r)) < 1e-14) throw Error("边界面积为零");
    for (let i = 0; i < r.length - 1; i++)
      for (let j = i + 2; j < r.length - 1; j++) {
        if (i === 0 && j === r.length - 2) continue;
        if (intersect(r[i], r[i + 1], r[j], r[j + 1]))
          throw Error("边界自交，请核实来源");
      }
    return r;
  }
  function validateGeometry(g) {
    if (!g || !["Point", "Polygon", "MultiPolygon"].includes(g.type))
      throw Error("不支持的几何类型");
    if (g.type === "Point")
      return { type: "Point", coordinates: toWgs(g.coordinates, "WGS84") };
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    if (!Array.isArray(polys) || !polys.length || polys.length > 100)
      throw Error("多边形为空或数量过多");
    let total = 0;
    const cleaned = polys.map((poly) => {
      if (!Array.isArray(poly) || !poly.length || poly.length > 100)
        throw Error("缺少外环");
      const rings = poly.map(cleanRing);
      for (let h = 1; h < rings.length; h++) {
        if (!inside(rings[h][0], rings[0])) throw Error("孔洞位于外环之外");
        for (let k = 0; k < h; k++) {
          for (let i = 0; i < rings[h].length - 1; i++)
            for (let j = 0; j < rings[k].length - 1; j++)
              if (
                intersect(
                  rings[h][i],
                  rings[h][i + 1],
                  rings[k][j],
                  rings[k][j + 1]
                )
              )
                throw Error("多边形环相交");
          if (
            k > 0 &&
            (inside(rings[h][0], rings[k]) || inside(rings[k][0], rings[h]))
          )
            throw Error("孔洞互相包含");
        }
      }
      rings.forEach((r, i) => {
        total += r.length;
        if (area(r) > 0 !== (i === 0)) r.reverse();
      });
      return rings;
    });
    for (let a = 0; a < cleaned.length; a++)
      for (let b = a + 1; b < cleaned.length; b++) {
        for (const r of cleaned[a])
          for (const q of cleaned[b])
            for (let i = 0; i < r.length - 1; i++)
              for (let j = 0; j < q.length - 1; j++)
                if (intersect(r[i], r[i + 1], q[j], q[j + 1]))
                  throw Error("多面边界相交或接触，请核实来源");
        const contains = (p, poly) =>
          inside(p, poly[0]) && !poly.slice(1).some((r) => inside(p, r));
        if (
          contains(cleaned[a][0][0], cleaned[b]) ||
          contains(cleaned[b][0][0], cleaned[a])
        )
          throw Error("多面边界互相重叠");
      }
    if (total > 20000) throw Error("边界总点数过多");
    return {
      type: g.type,
      coordinates: g.type === "Polygon" ? cleaned[0] : cleaned
    };
  }
  function mapGeometry(g, fn) {
    if (!g) return null;
    if (g.type === "Point")
      return { type: "Point", coordinates: fn(g.coordinates) };
    if (g.type === "Polygon")
      return {
        type: "Polygon",
        coordinates: g.coordinates.map((r) => r.map(fn))
      };
    if (g.type === "MultiPolygon")
      return {
        type: "MultiPolygon",
        coordinates: g.coordinates.map((p) => p.map((r) => r.map(fn)))
      };
    throw Error("未知几何类型");
  }
  function text(v, max = 500) {
    return String(v ?? "").slice(0, max);
  }
  function normalize(c) {
    if (!c || !PROVIDERS[c.provider]) throw Error("未知地图来源");
    const poiid = text(c.poiid, 160),
      name = text(c.name, 250);
    if (!poiid || !name) throw Error("缺少地点名称或ID");
    const crs = c.source_crs;
    if (!["WGS84", "GCJ02", "BD09LL", "BD09MC"].includes(crs))
      throw Error("缺少有效源坐标系");
    if (!c.source_geometry)
      throw Error("该地点未返回边界，请搜索并点击具体地点");
    if (c.provider === "tencent" && c.source_geometry.type !== "Point")
      throw Error("腾讯 AOI 尚未验证，当前仅支持地点记录");
    if (c.provider !== "tencent" && c.source_geometry.type === "Point")
      throw Error("中心点不能作为AOI保存");
    const geometry = validateGeometry(
      mapGeometry(c.source_geometry, (p) => toWgs(p, crs))
    );
    const center = toWgs(c.source_center, crs);
    const warnings = [];
    if (c.source_quality?.is_precise === 0)
      warnings.push("来源标记为非精确边界，请核实");
    if (
      c.provider === "tencent" &&
      Math.max(...center.map((v, i) => Math.abs(v - geometry.coordinates[i]))) >
        1e-10
    )
      throw Error("地点中心与来源坐标不一致");
    if (c.provider === "tencent")
      warnings.push("腾讯实验支持：仅保存地点信息，不含AOI边界");
    if (geometry.type !== "Point") {
      const polys =
        geometry.type === "Polygon"
          ? [geometry.coordinates]
          : geometry.coordinates;
      if (
        !polys.some(
          (p) =>
            inside(center, p[0]) && !p.slice(1).some((h) => inside(center, h))
        )
      )
        warnings.push("中心点不在边界内，请核实地点关联");
    }
    return {
      schema_version: 2,
      id: c.provider + ":" + poiid,
      provider: c.provider,
      poiid,
      name,
      address: text(c.address),
      address_detail: text(c.address_detail),
      city: text(c.city, 100),
      typecode: text(c.typecode, 100),
      source_crs: crs,
      source_geometry: JSON.parse(JSON.stringify(c.source_geometry)),
      source_center: pair(c.source_center),
      source_quality: {
        is_precise: [0, 1].includes(c.source_quality?.is_precise)
          ? c.source_quality.is_precise
          : null
      },
      source_field: text(c.source_field, 160),
      raw_boundary: text(c.raw_boundary, 1000000),
      geometry,
      center,
      lng: center[0],
      lat: center[1],
      kind: geometry.type === "Point" ? "poi" : "aoi",
      warnings,
      created_at: new Date().toISOString()
    };
  }
  function gaodeCandidate(p) {
    const id = p.id || p.poiid;
    let raw = (p.domain_list || []).find((x) => x.name === "aoi")?.value;
    let geom = null,
      error = "";
    if (raw) {
      try {
        geom = {
          type: "Polygon",
          coordinates: [
            raw
              .split("_")
              .filter(Boolean)
              .map((s) => s.split(",").map(Number))
          ]
        };
      } catch {
        error = "未识别高德边界编码";
      }
    }
    return {
      provider: "gaode",
      poiid: text(id),
      name: text(p.name),
      address: p.address || "",
      address_detail: "",
      city: p.cityname || "",
      typecode: p.newtype || p.typecode || "",
      source_crs: "GCJ02",
      source_center: [Number(p.longitude ?? p.x), Number(p.latitude ?? p.y)],
      source_geometry: geom,
      source_field: "data.poi_list.domain_list[aoi]",
      raw_boundary: raw || "",
      error
    };
  }
  function parseBaiduProfile(raw) {
    if (typeof raw !== "string" || raw.length > 1000000)
      throw Error("百度边界为空或过大");
    const parts = raw.split("|");
    if (parts.length !== 3 || parts[0] !== "4")
      throw Error("尚未支持此百度边界编码");
    const rings = parts[2].split(";").filter(Boolean);
    if (rings.length !== 1 || !rings[0].startsWith("1-"))
      throw Error("尚未验证此百度多环编码");
    const nums = rings[0].slice(2).split(",").map(Number);
    if (nums.length % 2) throw Error("百度边界坐标不成对");
    const points = [];
    for (let i = 0; i < nums.length; i += 2)
      points.push([nums[i], nums[i + 1]]);
    return { type: "Polygon", coordinates: [points] };
  }
  function baiduCandidate(p) {
    const raw = p.profile_geo || p.ext?.detail_info?.guoke_geo?.geo || "";
    let geometry = null,
      error = "";
    if (raw) {
      try {
        geometry = parseBaiduProfile(raw);
      } catch (e) {
        error = e.message;
      }
    }
    let center;
    try {
      const s = p.geo?.split("|");
      if (s?.[0] === "1") center = s[2].split(";")[0].split(",").map(Number);
    } catch {}
    if (!center) center = [Number(p.x) / 100, Number(p.y) / 100];
    return {
      provider: "baidu",
      poiid: text(p.uid),
      name: text(p.name),
      address: p.addr || "",
      city: p.city_name || "",
      typecode: p.new_catalog_id || p.catalogID || "",
      source_crs: "BD09MC",
      source_center: center,
      source_geometry: geometry,
      raw_boundary: raw,
      source_field: p.profile_geo
        ? "content.profile_geo"
        : "content.ext.detail_info.guoke_geo.geo",
      source_quality: {
        is_precise: p.ext?.detail_info?.guoke_geo?.is_precise ?? null
      },
      error
    };
  }
  function parseResponse(provider, url, data) {
    let d = typeof data === "string" ? JSON.parse(data) : data;
    let u = new URL(url, "https://example.invalid");
    if (provider === "gaode") {
      if (/poiInfo/i.test(u.pathname) && Array.isArray(d.data?.poi_list))
        return {
          mode: "search",
          candidates: (d.data?.poi_list || [])
            .filter((p) => p.id && p.name)
            .slice(0, 20)
            .map(gaodeCandidate)
        };
      if (
        (u.pathname.includes("/detail/get/detail") ||
          /getPoiDetail|getDeepInfoPoi/.test(u.pathname)) &&
        d.data?.base
      ) {
        const c = gaodeCandidate(d.data.base);
        c.address_detail = d.data.base.address || "";
        return { mode: "detail", candidates: [c] };
      }
    }
    if (provider === "baidu") {
      if (d.result?.anti_session?.need_recaptcha)
        return {
          status: "verification",
          message: "请在百度页面完成人工安全验证",
          candidates: []
        };
      if (u.searchParams.get("qt") === "s" && Array.isArray(d.content))
        return {
          mode: "search",
          candidates: d.content
            .filter((p) => p && p.uid && p.name)
            .slice(0, 20)
            .map(baiduCandidate)
        };
    }
    if (
      provider === "baidu" &&
      u.searchParams.get("qt") === "detailConInfo" &&
      d.content?.uid
    )
      return { mode: "detail", candidates: [baiduCandidate(d.content)] };
    if (
      provider === "tencent" &&
      u.pathname.includes("mapsearch") &&
      Array.isArray(d.detail?.pois)
    )
      return {
        mode: "search",
        candidates: d.detail.pois
          .filter((p) => p.uid && p.name)
          .slice(0, 20)
          .map((p) => ({
            provider,
            poiid: text(p.uid),
            name: text(p.name),
            address: p.addr || "",
            city: d.detail.city?.cname || "",
            typecode: p.CO || "",
            source_crs: "GCJ02",
            source_center: [Number(p.pointx), Number(p.pointy)],
            source_geometry: {
              type: "Point",
              coordinates: [Number(p.pointx), Number(p.pointy)]
            },
            source_field: "detail.pois.center",
            source_quality: { is_precise: null }
          }))
      };
    return null;
  }
  function legacy(a) {
    if (a.schema_version === 2) return a;
    let source;
    if (a.coords_gcj02) {
      source = {
        provider: "gaode",
        poiid: a.poiid,
        name: a.name,
        address: a.address_poiinfo || a.address || "",
        address_detail: a.address_detail || "",
        city: a.city,
        source_crs: "GCJ02",
        source_geometry: {
          type: "Polygon",
          coordinates: [
            a.coords_gcj02
              .split("_")
              .filter(Boolean)
              .map((s) => s.split(",").map(Number))
          ]
        },
        source_center: [Number(a.lng), Number(a.lat)],
        source_field: "legacy.coords_gcj02"
      };
    } else {
      const pts =
        a.coords_wgs84 ||
        String(a.coords || "")
          .split(";")
          .filter(Boolean)
          .map((s) => s.split(",").map(Number));
      source = {
        provider: "gaode",
        poiid: a.poiid,
        name: a.name,
        address: a.address_poiinfo || a.address || "",
        city: a.city,
        source_crs: "WGS84",
        source_geometry: { type: "Polygon", coordinates: [pts] },
        source_center: gcjToWgs([Number(a.lng), Number(a.lat)]),
        source_field: "legacy.coords_wgs84"
      };
    }
    const n = normalize(source);
    n.created_at = a.created_at || n.created_at;
    n.typecode = text(a.typecode, 100);
    n.address_detail = text(a.address_detail);
    n.categories = {
      big: text(a.big_category),
      mid: text(a.mid_category),
      sub: text(a.sub_category)
    };
    n.warnings.push("从旧版记录迁移，建议核实中心坐标");
    return n;
  }
  function feature(r) {
    return {
      type: "Feature",
      id: r.id,
      properties: {
        NAME: r.name,
        PROVIDER: r.provider,
        POIID: r.poiid,
        ADDRESS: r.address,
        ADDRESS_POIINFO: r.address,
        TYPECODE: r.typecode || "",
        BIG_CATEGORY: r.categories?.big || "",
        MID_CATEGORY: r.categories?.mid || "",
        SUB_CATEGORY: r.categories?.sub || "",
        ADDRESS_DETAIL: r.address_detail,
        CITY_NAME: r.city,
        LONGITUDE: r.center[0],
        LATITUDE: r.center[1],
        KIND: r.kind,
        SOURCE_CRS: r.source_crs,
        SOURCE_PRECISE: r.source_quality?.is_precise,
        WARNINGS: r.warnings.join("；"),
        CREATED_AT: r.created_at
      },
      geometry: r.geometry
    };
  }
  function countPoints(r) {
    if (!r?.geometry || r.geometry.type === "Point") return 0;
    return (
      r.geometry.type === "Polygon"
        ? [r.geometry.coordinates]
        : r.geometry.coordinates
    ).reduce((n, p) => n + p.reduce((m, x) => m + x.length, 0), 0);
  }
  return {
    PROVIDERS,
    MC_BANDS,
    MC_COEFF,
    providerFor,
    mcToBd,
    wgsToGcj,
    gcjToWgs,
    bdToGcj,
    toWgs,
    normalize,
    validateGeometry,
    mapGeometry,
    parseResponse,
    parseBaiduProfile,
    legacy,
    feature,
    countPoints,
    inside
  };
});
