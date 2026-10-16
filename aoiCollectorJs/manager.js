"use strict";
const C = AOICore,
  extension = location.protocol === "chrome-extension:";
let records = [],
  selected = "",
  layers = new Map();
const $ = (id) => document.getElementById(id),
  el = (tag, text, cls) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
$("mode").textContent = extension ? "浏览器扩展" : "Web 工作台";
function notice(text, ok = false) {
  $("notice").hidden = false;
  $("notice").textContent = text;
  $("notice").className = ok ? "success" : "";
}
async function message(m) {
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage(m, (r) => {
      if (chrome.runtime.lastError)
        reject(Error(chrome.runtime.lastError.message));
      else if (!r?.ok) reject(Error(r?.error || "操作失败"));
      else resolve(r);
    })
  );
}
async function api(path, options) {
  const r = await fetch(path, options);
  let d;
  try {
    d = await r.json();
  } catch {
    throw Error("本地服务响应无效");
  }
  if (!r.ok || d.ok === false) throw Error(d.error || d.detail || "操作失败");
  return d;
}
let map,
  group,
  background,
  baseRequest = 0;
function gridLayer() {
  return new (L.GridLayer.extend({
    createTile(coords) {
      const tile = el("div", undefined, "coordinate-tile");
      const size = this.getTileSize();
      const corner = this._map.unproject(
        L.point(coords.x * size.x, coords.y * size.y),
        coords.z
      );
      const format = (n, a, b) =>
        Math.abs(n).toFixed(4) + "°" + (n >= 0 ? a : b);
      tile.append(
        el(
          "span",
          format(corner.lng, "E", "W") + " · " + format(corner.lat, "N", "S")
        )
      );
      return tile;
    }
  }))({ attribution: "WGS-84 · 坐标网格" });
}
function useBackground(layer) {
  if (background) map.removeLayer(background);
  background = layer;
  layer.addTo(map).bringToBack();
}
async function setBackground(kind) {
  const request = ++baseRequest;
  const status = $("mapStatus");
  status.hidden = true;
  useBackground(gridLayer());
  if (kind !== "osm") return;
  try {
    // Check HTTP status: a blocked tile may itself be a loadable error image.
    const response = await fetch("https://tile.openstreetmap.org/0/0/0.png", {
      signal: AbortSignal.timeout(8000),
      cache: "force-cache"
    });
    if (!response.ok) throw Error("底图服务不可用");
    await response.arrayBuffer();
    if (request !== baseRequest) return;
    const tiles = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        crossOrigin: true,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }
    );
    let failed = false;
    tiles.on("tileload", async (event) => {
      // A 403 image can still fire the image load event; inspect its HTTP response.
      try {
        const r = await fetch(event.tile.src, { cache: "force-cache" });
        if (!r.ok) fallback();
      } catch {
        fallback();
      }
    });
    function fallback() {
      if (failed || request !== baseRequest) return;
      failed = true;
      useBackground(gridLayer());
      $("baseLayer").value = "grid";
      status.hidden = false;
      status.textContent = "在线底图暂不可用，已切换坐标网格";
    }
    tiles.on("tileerror", fallback);
    useBackground(tiles);
  } catch {
    if (request !== baseRequest) return;
    $("baseLayer").value = "grid";
    status.hidden = false;
    status.textContent = "在线底图暂不可用，已切换坐标网格";
  }
}
try {
  map = L.map("map", { scrollWheelZoom: false }).setView([31, 111], 4);
  group = L.featureGroup().addTo(map);
  L.control.scale({ imperial: false }).addTo(map);
  const preferred = localStorage.getItem("aoi-basemap") || "grid";
  $("baseLayer").value = preferred;
  setBackground(preferred);
  $("baseLayer").onchange = (e) => {
    localStorage.setItem("aoi-basemap", e.target.value);
    setBackground(e.target.value);
  };
} catch {
  $("map").textContent = "地图组件加载失败，仍可导出已保存数据。";
}
function fit() {
  if (group?.getLayers().length)
    map.fitBounds(group.getBounds(), { padding: [32, 32], maxZoom: 17 });
}
function draw() {
  if (!group) return;
  group.clearLayers();
  layers.clear();
  for (const r of records) {
    try {
      const l = L.geoJSON(C.feature(r), {
        style: {
          color: r.id === selected ? "#a65339" : "#8e8370",
          weight: r.id === selected ? 3 : 1.5,
          fillColor: r.id === selected ? "#c8805d" : "#b5aa95",
          fillOpacity: r.id === selected ? 0.24 : 0.1
        },
        pointToLayer: (_, p) =>
          L.circleMarker(p, {
            radius: 7,
            color: "#ae742a",
            weight: 2,
            fillColor: "#e5ba71",
            fillOpacity: 0.9
          })
      });
      const tip = el("span", r.name);
      l.bindTooltip(tip, {
        permanent: r.id === selected,
        direction: "top",
        className: "aoi-map-label"
      });
      l.on("click", () => choose(r.id));
      group.addLayer(l);
      layers.set(r.id, l);
    } catch (e) {
      notice("部分记录无法预览：" + e.message);
    }
  }
}
function choose(id, zoom = true) {
  selected = id;
  draw();
  renderList();
  renderDetail();
  const layer = layers.get(id);
  if (zoom && layer)
    map.fitBounds(layer.getBounds(), {
      padding: [40, 40],
      maxZoom: records.find((r) => r.id === id)?.kind === "poi" ? 16 : 19
    });
}
function renderList() {
  const q = $("search").value.trim().toLowerCase(),
    p = $("providerFilter").value;
  const list = records.filter(
    (r) =>
      (!p || r.provider === p) &&
      [r.name, r.address, r.poiid].join(" ").toLowerCase().includes(q)
  );
  $("list").replaceChildren();
  for (const r of list) {
    const item = el(
      "div",
      undefined,
      "record" + (r.id === selected ? " active" : "")
    );
    item.tabIndex = 0;
    item.role = "button";
    const row = el("div", undefined, "row");
    row.append(
      el("b", r.name),
      el(
        "span",
        C.PROVIDERS[r.provider]?.name || r.provider,
        "tag" +
          (r.provider === "baidu"
            ? " blue"
            : r.provider === "tencent"
              ? " amber"
              : "")
      )
    );
    item.append(
      row,
      el("p", r.address || "暂无地址"),
      el(
        "small",
        r.kind === "aoi"
          ? C.countPoints(r) + " 点 · 来源边界"
          : "地点记录 · 无 AOI"
      )
    );
    if (r.warnings?.length)
      item.append(el("span", r.warnings.join("；"), "quality"));
    item.onclick = () => choose(r.id);
    item.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        choose(r.id);
      }
    };
    $("list").append(item);
  }
  if (!list.length)
    $("list").append(
      el(
        "div",
        records.length
          ? "没有匹配的记录"
          : "打开上方地图，开始采集第一个地点。",
        "empty"
      )
    );
  $("shown").textContent = list.length + " 条记录";
}
function renderDetail() {
  const r = records.find((x) => x.id === selected);
  $("detail").replaceChildren();
  if (!r) {
    $("detail").append(
      el(
        "div",
        "选择左侧记录查看详情。导出统一使用 WGS-84 坐标。",
        "detail-empty"
      )
    );
    return;
  }
  const top = el("div", undefined, "detail-top"),
    actions = el("div", undefined, "detail-actions");
  top.append(el("b", r.name), actions);
  if (!extension) {
    const zip = el("button", "下载 SHP 套件");
    zip.onclick = () => {
      location.href = "/api/files/" + encodeURIComponent(r.id);
    };
    actions.append(zip);
  }
  const remove = el("button", "删除", "danger");
  remove.onclick = async () => {
    if (
      !confirm(
        "删除「" +
          r.name +
          "」？" +
          (extension ? "请先导出备份。" : "本地历史文件会保留。")
      )
    )
      return;
    try {
      if (extension) await message({ type: "DELETE_RECORD", id: r.id });
      else
        await api("/api/records/" + encodeURIComponent(r.id), {
          method: "DELETE"
        });
      selected = "";
      await load();
    } catch (e) {
      notice(e.message);
    }
  };
  actions.append(remove);
  const meta = el("div", undefined, "detail-meta");
  meta.append(
    el("span", "地点 ID · " + r.poiid),
    el("span", "源坐标 · " + r.source_crs),
    el("span", "中心 · " + r.center.map((n) => n.toFixed(6)).join(", "))
  );
  if (r.source_attributes?.category)
    meta.append(el("span", "来源分类 · " + r.source_attributes.category));
  if (r.source_attributes?.phone)
    meta.append(el("span", "电话 · " + r.source_attributes.phone));
  $("detail").append(top, meta);
  if (r.warnings?.length)
    $("detail").append(el("div", r.warnings.join("；"), "detail-warning"));
  $("mapCaption").textContent =
    C.PROVIDERS[r.provider]?.name +
    " · " +
    (r.kind === "aoi" ? "来源边界" : "地点记录");
}
async function load() {
  try {
    let migration;
    if (extension) {
      const r = await message({ type: "GET_ALL" });
      records = r.data;
      migration = r.migration;
    } else {
      records = await api("/api/list");
      migration = (await api("/api/status")).migration;
    }
    records.sort((a, b) =>
      (b.created_at || "").localeCompare(a.created_at || "")
    );
    $("aoiCount").textContent = records.filter((r) => r.kind === "aoi").length;
    $("poiCount").textContent = records.filter((r) => r.kind === "poi").length;
    $("sourceCount").textContent = new Set(records.map((r) => r.provider)).size;
    if (!records.some((r) => r.id === selected))
      selected = records[0]?.id || "";
    renderList();
    draw();
    renderDetail();
    if (!map?.__fitted && records.length) {
      fit();
      map.__fitted = true;
    }
    if (migration?.failures?.length)
      notice(
        "有 " +
          migration.failures.length +
          " 条旧记录未能迁移，旧数据库已保留，请先备份核实。"
      );
  } catch (e) {
    notice("读取失败：" + e.message);
  }
}
$("search").oninput = renderList;
$("providerFilter").onchange = renderList;
$("refresh").onclick = load;
$("fit").onclick = fit;
for (const b of document.querySelectorAll("[data-provider]"))
  b.onclick = async () => {
    try {
      const p = b.dataset.provider;
      if (extension) {
        await chrome.tabs.create({ url: C.PROVIDERS[p].url });
      } else {
        b.disabled = true;
        b.textContent = "正在打开…";
        await api("/api/collect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: p })
        });
        notice("地图已打开。搜索并点击具体地点后，在采集浮窗中保存。", true);
      }
    } catch (e) {
      notice("打开失败：" + e.message);
    } finally {
      b.disabled = false;
      b.textContent = "打开地图 ↗";
    }
  };
function download(text, name, mime = "application/json") {
  const u = URL.createObjectURL(new Blob([text], { type: mime }));
  if (extension)
    chrome.downloads.download({ url: u, filename: name, saveAs: true }, () =>
      setTimeout(() => URL.revokeObjectURL(u), 60000)
    );
  else {
    const a = el("a");
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  }
}
function requireData() {
  if (!records.length) {
    notice("暂无记录，请先采集。");
    return false;
  }
  return true;
}
$("geojson").onclick = () => {
  if (requireData())
    download(
      JSON.stringify(
        { type: "FeatureCollection", features: records.map(C.feature) },
        null,
        2
      ),
      "aoi.geojson",
      "application/geo+json"
    );
};
$("backup").onclick = () => {
  if (requireData())
    download(
      JSON.stringify(
        { schema_version: 2, exported_at: new Date().toISOString(), records },
        null,
        2
      ),
      "aoi-backup.json"
    );
};
$("csv").onclick = () => {
  if (!requireData()) return;
  const headers = [
    "NAME",
    "PROVIDER",
    "POIID",
    "ADDRESS",
    "CITY_NAME",
    "KIND",
    "LONGITUDE",
    "LATITUDE",
    "CATEGORY",
    "PHONE",
    "SOURCE_CRS",
    "SOURCE_PRECISE",
    "WARNINGS",
    "GEOMETRY_WGS84"
  ];
  const rows = records.map((r) => [
    r.name,
    r.provider,
    r.poiid,
    r.address,
    r.city,
    r.kind,
    ...r.center,
    r.source_attributes?.category || "",
    r.source_attributes?.phone || "",
    r.source_crs,
    r.source_quality?.is_precise ?? "",
    r.warnings.join("；"),
    JSON.stringify(r.geometry)
  ]);
  const quote = (v) => {
    let s = String(v ?? "");
    if (typeof v === "string" && /^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  download(
    "\uFEFF" +
      [headers, ...rows].map((row) => row.map(quote).join(",")).join("\r\n"),
    "aoi.csv",
    "text/csv;charset=utf-8"
  );
};
$("restore").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    if (f.size > 20000000) throw Error("备份文件超过20MB");
    const data = JSON.parse((await f.text()).replace(/^\uFEFF/, "")),
      rows = data.records;
    if (!Array.isArray(rows) || rows.length > 500)
      throw Error("请选择完整备份，每次最多恢复500条");
    rows.forEach(C.normalize);
    if (!confirm("恢复 " + rows.length + " 条记录？同一来源和ID的记录会更新。"))
      return;
    if (extension) await message({ type: "RESTORE", records: rows });
    else {
      let n = 0;
      for (const r of rows) {
        try {
          await api("/api/report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(r)
          });
          n++;
        } catch (e) {
          throw Error("已恢复 " + n + " 条，后续记录失败：" + e.message);
        }
      }
    }
    notice("备份已恢复。", true);
    await load();
  } catch (err) {
    notice("恢复失败：" + err.message);
  } finally {
    e.target.value = "";
  }
};
load();
