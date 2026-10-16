const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path");
const C = require("../aoiCollectorJs/core.js");
const fixtures = require("./fixtures/baidu.json");
const gaode = {
  provider: "gaode",
  poiid: "synthetic-a",
  name: "同名医院",
  address: "测试地址",
  city: "北京",
  source_crs: "GCJ02",
  source_geometry: {
    type: "Polygon",
    coordinates: [
      [
        [116.32, 40],
        [116.34, 40],
        [116.34, 40.02],
        [116.32, 40.02]
      ]
    ]
  },
  source_center: [116.33, 40.01]
};
test("real Baidu source polygons convert, close, retain IDs and source quality", () => {
  for (const f of fixtures) {
    const r = C.normalize(f.candidate);
    assert.equal(r.id, "baidu:" + f.candidate.poiid);
    assert.equal(C.countPoints(r), f.expected_point_count);
    assert.deepEqual(
      r.geometry.coordinates[0][0],
      r.geometry.coordinates[0].at(-1)
    );
    const bd = C.mcToBd(f.candidate.source_geometry.coordinates[0][0]);
    assert.ok(
      bd.every((v, i) => Math.abs(v - f.expected_bd09ll_first[i]) < 1e-9)
    );
    assert.equal(
      r.warnings.length,
      f.candidate.source_quality.is_precise === 0 ? 1 : 0
    );
    assert.ok(r.center.every((v) => Number.isFinite(v)));
  }
});
test("Baidu adapter takes profile_geo, not aoi place name or building geometry", () => {
  const f = fixtures[0].candidate;
  const out = C.parseResponse("baidu", "https://map.baidu.com/?qt=s", {
    content: [
      {
        name: f.name,
        uid: f.poiid,
        profile_geo: f.raw_boundary,
        geo: "1|0;0|" + f.source_center.join(",") + ";",
        ext: {
          detail_info: {
            guoke_geo: { geo: f.raw_boundary, is_precise: 1 },
            guoke_geo_bud: { bud_geom: "not the AOI" }
          }
        }
      }
    ]
  });
  assert.equal(out.candidates.length, 1);
  assert.equal(
    C.normalize(out.candidates[0]).geometry.coordinates[0].length,
    855
  );
  assert.throws(() => C.parseBaiduProfile("4|a|1-1,2,3,4;2-3,4,5,6;"), /多环/);
});
test("Baidu detail selects its UID and verification cannot be saved as a boundary", () => {
  const out = C.parseResponse(
    "baidu",
    "https://map.baidu.com/?qt=detailConInfo",
    {
      content: { name: "点击的地点", uid: "b", geo: "1|0;0|12612350,2631132;" }
    }
  );
  assert.equal(out.mode, "detail");
  assert.equal(out.candidates[0].poiid, "b");
  assert.equal(out.candidates[0].source_geometry, null);
  assert.equal(
    C.parseResponse("baidu", "https://map.baidu.com/?qt=s", {
      result: { anti_session: { need_recaptcha: true } }
    }).status,
    "verification"
  );
});
test("GCJ roundtrip and common native/WGS center are consistent", () => {
  for (const p of [
    [116.33, 40.01],
    [113.29, 23.12],
    [0, 0]
  ]) {
    const q = C.gcjToWgs(C.wgsToGcj(p));
    assert.ok(q.every((v, i) => Math.abs(v - p[i]) < 1e-8));
  }
  const r = C.normalize(gaode);
  assert.deepEqual(r.center, C.gcjToWgs(gaode.source_center));
  assert.notEqual(r.center[0], gaode.source_center[0]);
});
test("invalid coordinates, self intersections and out-of-shell holes are rejected", () => {
  assert.throws(() => C.normalize({ ...gaode, source_center: [NaN, 40] }));
  assert.throws(() =>
    C.normalize({
      ...gaode,
      source_geometry: {
        type: "Polygon",
        coordinates: [
          [
            [116, 40],
            [117, 41],
            [116, 41],
            [117, 40]
          ]
        ]
      }
    })
  );
  assert.throws(() =>
    C.normalize({
      ...gaode,
      source_geometry: {
        type: "Polygon",
        coordinates: [
          gaode.source_geometry.coordinates[0],
          [
            [118, 42],
            [118.1, 42],
            [118.1, 42.1]
          ]
        ]
      }
    })
  );
  assert.throws(
    () => C.normalize({ ...gaode, source_geometry: null }),
    /未返回边界/
  );
});
test("holes, multiple polygons and GeoJSON retain topology and closure", () => {
  const g = {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4]
        ],
        [
          [1, 1],
          [1, 2],
          [2, 2],
          [2, 1]
        ]
      ],
      [
        [
          [8, 0],
          [9, 0],
          [9, 1],
          [8, 1]
        ]
      ]
    ]
  };
  const r = C.normalize({
    ...gaode,
    source_crs: "WGS84",
    source_center: [0.5, 0.5],
    source_geometry: g
  });
  assert.equal(r.geometry.coordinates.length, 2);
  assert.equal(r.geometry.coordinates[0].length, 2);
  assert.equal(C.feature(r).geometry.type, "MultiPolygon");
  assert.equal(r.geometry.coordinates[0][1].length, 5);
});
test("Tencent bbox never becomes AOI; same raw ID is namespaced by provider", () => {
  const p = C.parseResponse(
    "tencent",
    "https://mmapgwpc.map.qq.com/mapsearch",
    {
      detail: {
        city: { cname: "北京" },
        pois: [
          {
            uid: "synthetic-a",
            name: "同名医院",
            pointx: 116.33,
            pointy: 40.01,
            richInfo: { rich: [{ famous_bounds: "1,2;3,4" }] }
          }
        ]
      }
    }
  ).candidates[0];
  const r = C.normalize(p);
  assert.equal(r.geometry.type, "Point");
  assert.equal(r.id, "tencent:synthetic-a");
  assert.notEqual(r.id, C.normalize(gaode).id);
  assert.throws(
    () => C.normalize({ ...p, source_geometry: gaode.source_geometry }),
    /尚未验证/
  );
  assert.throws(
    () => C.normalize({ ...p, source_center: [116, 40] }),
    /不一致/
  );
});
test("fetch hook reads resolved Response, preserves original promise and original body", async () => {
  const events = [],
    listeners = {};
  let resolve;
  const original = new Promise((r) => (resolve = r));
  const fakeXHR = function () {};
  fakeXHR.prototype.open = function () {};
  fakeXHR.prototype.send = function () {};
  const ctx = {
    AOICore: C,
    location: { href: "https://www.amap.com/", origin: "https://www.amap.com" },
    XMLHttpRequest: fakeXHR,
    URL,
    console,
    fetch: () => original,
    postMessage: (m) => events.push(m),
    addEventListener: (n, f) => (listeners[n] = f)
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../aoiCollectorJs/hook.js"), "utf8"),
    ctx
  );
  const result = ctx.fetch("https://www.amap.com/service/poiInfo");
  assert.equal(result, original);
  resolve(
    new Response(
      JSON.stringify({
        data: {
          poi_list: [{ id: "a", name: "地点", longitude: 116, latitude: 40 }]
        }
      })
    )
  );
  const response = await result;
  assert.ok(await response.json());
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(events.length, 1);
  assert.equal(events[0].candidates[0].poiid, "a");
  listeners.message({
    source: vm.runInContext("window", ctx),
    origin: "https://www.amap.com",
    data: { channel: "AOI_COLLECTOR_V2_READY" }
  });
  assert.equal(events.length, 2);
});
module.exports = { gaode };

test("live Gaode hospital source parses with 44 points and ignores non-POI responses", () => {
  const f = require("./fixtures/gaode.json");
  const parsed = C.parseResponse("gaode", "https://www.amap.com" + f.path, {
    data: { poi_list: [f.poi] }
  });
  const r = C.normalize(parsed.candidates[0]);
  assert.equal(r.id, "gaode:B00140226E");
  assert.equal(C.countPoints(r), f.expected_point_count);
  assert.equal(r.source_crs, "GCJ02");
  assert.equal(r.typecode, "090101");
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.source_geometry.coordinates[0][0], [113.290749, 23.12653]);
  assert.equal(
    C.parseResponse("gaode", "https://www.amap.com/api/getPoiInfo", {
      data: {}
    }),
    null
  );
});
