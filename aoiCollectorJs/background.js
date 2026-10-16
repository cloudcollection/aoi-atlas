"use strict";
importScripts("core.js", "libs/typecode_map.js");
const C = AOICore;
let dbPromise;
const typeReady = (async () => {
  try {
    importScripts("libs/xlsx.full.min.js");
    const r = await fetch(chrome.runtime.getURL("excel/gaode_typecode.xlsx"));
    if (!r.ok) return;
    const wb = XLSX.read(await r.arrayBuffer(), { type: "array" });
    for (const row of XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])) {
      const key = String(row.NEW_TYPE || "");
      if (key)
        TYPECODE_MAP[key] = {
          big: row["大类"],
          mid: row["中类"],
          sub: row["小类"]
        };
    }
  } catch {}
})();
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open("aoi_collector", 2);
    req.onupgradeneeded = () => {
      const d = req.result,
        tx = req.transaction;
      const target = d.objectStoreNames.contains("records")
        ? tx.objectStore("records")
        : d.createObjectStore("records", { keyPath: "id" });
      if (!d.objectStoreNames.contains("meta"))
        d.createObjectStore("meta", { keyPath: "key" });
      if (d.objectStoreNames.contains("aois")) {
        const failures = [];
        const cursor = tx.objectStore("aois").openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c) {
            tx.objectStore("meta").put({
              key: "migration",
              failures,
              legacyPreserved: true
            });
            return;
          }
          try {
            target.put(C.legacy(c.value));
          } catch (e) {
            failures.push({
              poiid: c.value.poiid,
              name: c.value.name,
              error: e.message
            });
          }
          c.continue();
        };
      }
    };
    req.onsuccess = () => {
      const d = req.result;
      d.onversionchange = () => {
        d.close();
        dbPromise = null;
      };
      resolve(d);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
    req.onblocked = () => {
      dbPromise = null;
      reject(Error("数据库升级被其他窗口占用，请关闭旧管理页后重试"));
    };
  });
  return dbPromise;
}
async function query(mode, action, store = "records") {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode);
    let result;
    const r = action(tx.objectStore(store));
    if (r)
      r.onsuccess = () => {
        result = r.result;
      };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || Error("数据库操作失败"));
    tx.onabort = () => reject(tx.error || Error("数据库操作中止"));
  });
}
async function save(candidate) {
  const r = C.normalize(candidate);
  await typeReady;
  if (r.provider === "gaode" && typeof TYPECODE_MAP !== "undefined")
    r.categories =
      TYPECODE_MAP[r.typecode] ||
      TYPECODE_MAP[String(Number(r.typecode))] ||
      null;
  await query("readwrite", (s) => s.put(r));
  return { ok: true, id: r.id, warnings: r.warnings };
}
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  const internal = sender.url?.startsWith(chrome.runtime.getURL("")),
    provider = C.providerFor(sender.tab?.url || "");
  const work = async () => {
    if (msg.type === "SAVE_CANDIDATE") {
      if (!provider || provider !== msg.candidate?.provider)
        throw Error("地图来源不匹配");
      return save(msg.candidate);
    }
    if (msg.type === "GET_COUNT" && provider)
      return { ok: true, count: await query("readonly", (s) => s.count()) };
    if (!internal) throw Error("此操作仅允许在扩展管理页使用");
    if (msg.type === "GET_ALL")
      return {
        ok: true,
        data: await query("readonly", (s) => s.getAll()),
        migration: await query("readonly", (s) => s.get("migration"), "meta")
      };
    if (msg.type === "DELETE_RECORD") {
      if (typeof msg.id !== "string") throw Error("缺少记录ID");
      await query("readwrite", (s) => s.delete(msg.id));
      return { ok: true };
    }
    if (msg.type === "RESTORE") {
      if (!Array.isArray(msg.records) || msg.records.length > 500)
        throw Error("每次最多恢复500条记录");
      const records = msg.records.map((r) => {
        const n = C.normalize(r);
        if (
          typeof r.created_at === "string" &&
          !Number.isNaN(Date.parse(r.created_at))
        )
          n.created_at = r.created_at;
        if (n.provider === "gaode")
          n.categories =
            TYPECODE_MAP[n.typecode] ||
            TYPECODE_MAP[String(Number(n.typecode))] ||
            null;
        return n;
      });
      await typeReady;
      await query("readwrite", (s) => {
        for (const r of records) s.put(r);
      });
      return { ok: true, count: records.length };
    }
    throw Error("未知操作");
  };
  work()
    .then(respond)
    .catch((e) => respond({ ok: false, error: e.message }));
  return true;
});
chrome.runtime.onInstalled.addListener(() => {
  openDB().catch(console.error);
  chrome.alarms?.clear("keepalive");
});
