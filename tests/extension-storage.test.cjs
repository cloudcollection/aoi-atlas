const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path");
const { IDBFactory } = require("fake-indexeddb");
const ROOT = path.join(__dirname, "../aoiCollectorJs");
const candidate = {
  provider: "gaode",
  poiid: "abc",
  name: "测试医院",
  source_crs: "GCJ02",
  source_center: [116.33, 40.01],
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
  }
};
async function legacyDB(indexedDB) {
  await new Promise((resolve, reject) => {
    const r = indexedDB.open("aoi_collector", 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore("aois", { keyPath: "poiid" });
      s.put({
        poiid: "old",
        name: "旧记录",
        lng: 116.33,
        lat: 40.01,
        coords_wgs84: [
          [116.32, 40],
          [116.34, 40],
          [116.34, 40.02],
          [116.32, 40.02]
        ]
      });
      s.put({ poiid: "bad", name: "坏记录", coords_wgs84: [] });
    };
    r.onsuccess = () => {
      r.result.close();
      resolve();
    };
    r.onerror = () => reject(r.error);
  });
}
function worker(indexedDB) {
  let handle;
  const chrome = {
    runtime: {
      id: "test-extension",
      getURL: (p) => "chrome-extension://test-extension/" + p,
      onMessage: { addListener: (f) => (handle = f) },
      onInstalled: { addListener: () => {} }
    }
  };
  const ctx = {
    indexedDB,
    chrome,
    console,
    URL,
    fetch: async () => {
      throw Error("optional Excel unavailable");
    }
  };
  vm.createContext(ctx);
  ctx.importScripts = (...files) => {
    for (const f of files) {
      if (f.includes("xlsx")) throw Error("optional Excel unavailable");
      vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx);
    }
  };
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, "background.js"), "utf8"),
    ctx
  );
  return (
    msg,
    sender = {
      id: "test-extension",
      url: "chrome-extension://test-extension/manager.html"
    }
  ) => new Promise((resolve) => handle(msg, sender, resolve));
}
test("extension migrates valid records, preserves legacy store, reports failures", async () => {
  const idb = new IDBFactory();
  await legacyDB(idb);
  const send = worker(idb);
  const r = await send({ type: "GET_ALL" });
  assert.equal(r.ok, true);
  assert.equal(r.data.length, 1);
  assert.equal(r.data[0].id, "gaode:old");
  assert.equal(r.migration.failures.length, 1);
  const d = await new Promise((resolve) => {
    const req = idb.open("aoi_collector", 2);
    req.onsuccess = () => resolve(req.result);
  });
  assert.ok(d.objectStoreNames.contains("aois"));
  const count = await new Promise((resolve) => {
    const tx = d.transaction("aois"),
      r = tx.objectStore("aois").count();
    r.onsuccess = () => resolve(r.result);
  });
  assert.equal(count, 2);
  d.close();
});
test("extension enforces provider, namespace and management sender before writing", async () => {
  const send = worker(new IDBFactory());
  const tab = {
    id: "test-extension",
    url: "https://www.amap.com/",
    tab: { url: "https://www.amap.com/" }
  };
  const mismatch = await send(
    { type: "SAVE_CANDIDATE", candidate: { ...candidate, provider: "baidu" } },
    tab
  );
  assert.equal(mismatch.ok, false);
  const saved = await send({ type: "SAVE_CANDIDATE", candidate }, tab);
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.equal((await send({ type: "GET_ALL" }, tab)).ok, false);
  const r = await send({ type: "GET_ALL" });
  assert.equal(r.data.length, 1);
  assert.equal(r.data[0].id, "gaode:abc");
  const broken = await send({
    type: "RESTORE",
    records: [candidate, { ...candidate, poiid: "bad", source_geometry: null }]
  });
  assert.equal(broken.ok, false);
  assert.equal((await send({ type: "GET_ALL" })).data.length, 1);
  assert.equal(
    (await send({ type: "DELETE_RECORD", id: "gaode:abc" })).ok,
    true
  );
  assert.equal((await send({ type: "GET_ALL" })).data.length, 0);
});
