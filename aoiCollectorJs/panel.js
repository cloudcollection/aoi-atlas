(() => {
  "use strict";
  if (window.__aoiPanelV2) return;
  window.__aoiPanelV2 = true;
  const C = globalThis.AOICore,
    provider = C.providerFor(location.href);
  if (!provider) return;
  const web = !!window.__AOI_WEB_CONFIG,
    pending = new Map();
  let items = [],
    selected = "",
    saving = false;
  const host = document.createElement("div");
  host.id = "aoi-collector-panel";
  host.style.cssText = "position:fixed;right:22px;top:90px;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "open" });
  const logo = web
    ? window.__AOI_WEB_CONFIG.logo
    : chrome.runtime.getURL("images/aoi-logo.svg");
  shadow.innerHTML = `<style>
    :host{all:initial;font-family:Georgia,"Noto Serif SC","Source Han Serif SC","Songti SC","STSong","SimSun",serif;color:#302e2a}
    *{box-sizing:border-box}
    .panel{width:320px;background:#fcfbf8;border:1px solid #e4dfd6;border-radius:16px;box-shadow:0 16px 60px #47352624;overflow:hidden}
    .head{padding:16px 18px;background:#f3eee5;border-bottom:1px solid #e4dfd6;display:flex;justify-content:space-between;align-items:center;gap:10px}
    .head img{width:36px;height:36px;flex:none}.heading{flex:1}
    .head b{font-size:15px;font-weight:600}.head small{display:block;color:#716b63;margin-top:4px;font-size:11px}
    .fold{border:0;background:none;color:#716b63;font-size:20px;cursor:pointer}
    .body{padding:18px}.label{font-size:11px;letter-spacing:1px;color:#716b63;margin:0 0 8px}
    .status{font-size:13px;line-height:1.7;padding:11px 12px;background:#f2ede3;border-radius:8px;margin:12px 0;color:#735840}
    .warning{background:#fff3df;color:#885b16}
    select{font:inherit;font-size:13px;width:100%;padding:10px 8px;border:1px solid #ded7cb;background:#fff;border-radius:8px}
    .name{font-size:18px;font-weight:600;line-height:1.6;margin:14px 0 5px}
    .address{font-size:12px;line-height:1.7;color:#716b63;overflow-wrap:anywhere}
    button.save{width:100%;padding:11px;margin-top:16px;border:0;border-radius:8px;background:#a65339;color:#fff;font:inherit;font-size:14px;cursor:pointer}
    button.save:hover{background:#8e422e}button:disabled{opacity:.45;cursor:default}
    button:focus-visible,select:focus-visible{outline:2px solid #a65339;outline-offset:3px}
    .foot{margin-top:12px;color:#716b63;font-size:11px;line-height:1.7}
  </style><section class="panel"><div class="head"><img alt="AOI" width="36" height="36"><div class="heading"><b>AOI · 多地图采集</b><small></small></div><button class="fold" title="收起">−</button></div><div class="body"><p class="label">当前地点</p><select aria-label="选择搜索结果"></select><div class="name">等待地图搜索</div><div class="address">在地图上搜索名称，再点击具体地点。</div><div class="status" role="status">等待页面返回地点信息</div><button class="save" disabled>采集当前边界</button><div class="foot"></div></div></section>`;
  shadow.querySelector(".head img").src = logo;
  const $ = (s) => shadow.querySelector(s);
  $(".head small").textContent =
    C.PROVIDERS[provider].name +
    (provider === "tencent" ? " · 实验支持" : " · AOI 边界");
  $(".foot").textContent = web
    ? "数据保存在本地 Web 工具。仅捕获正常页面操作返回的信息。"
    : "数据保存在扩展本地。请在管理页导出备份。";
  function mount() {
    if (host.isConnected) return;
    const parent = document.body || document.documentElement;
    if (parent) parent.appendChild(host);
    else document.addEventListener("DOMContentLoaded", mount, { once: true });
  }
  mount();
  $(".fold").onclick = () => {
    const body = $(".body");
    body.hidden = !body.hidden;
    $(".fold").textContent = body.hidden ? "+" : "−";
  };
  function status(message, warn = false) {
    $(".status").textContent = message;
    $(".status").className = "status" + (warn ? " warning" : "");
  }
  function render() {
    const option = $("select");
    option.replaceChildren();
    for (const c of items) {
      const el = document.createElement("option");
      el.value = c.poiid;
      el.textContent =
        c.name +
        (c.source_geometry?.type === "Point"
          ? " · 仅地点"
          : c.source_geometry
            ? " · 有边界"
            : " · 无边界");
      option.appendChild(el);
    }
    option.value = selected;
    const c = items.find((x) => x.poiid === selected);
    $(".save").disabled = saving || !c?.source_geometry;
    $(".save").textContent = saving
      ? "正在保存…"
      : provider === "tencent"
        ? "保存地点（无边界）"
        : "采集当前边界";
    if (!c) {
      status("未捕获地点信息，请在地图中搜索");
      $(".name").textContent = "等待地图搜索";
      $(".address").textContent = "在地图上搜索名称，再点击具体地点。";
      return;
    }
    $(".name").textContent = c.name;
    $(".address").textContent = c.address_detail || c.address || "暂无地址";
    if (c.error) status(c.error, true);
    else if (provider === "tencent")
      status("实验支持：仅保存地点信息，包围框不会作为AOI。", true);
    else if (!c.source_geometry)
      status(
        "此地点未返回边界，请搜索并点击具体地点。不会自动换成其他地点。",
        true
      );
    else {
      const n = c.source_geometry.coordinates[0]?.length || 0;
      status(
        "已捕获来源边界 · " +
          n +
          " 个点" +
          (c.source_quality?.is_precise === 0
            ? " · 来源标记非精确，请核实"
            : ""),
        c.source_quality?.is_precise === 0
      );
    }
  }
  $("select").onchange = (e) => {
    selected = e.target.value;
    render();
  };
  window.addEventListener("message", (e) => {
    if (
      e.source !== window ||
      e.origin !== location.origin ||
      e.data?.channel !== "AOI_COLLECTOR_V2" ||
      e.data.provider !== provider
    )
      return;
    const d = e.data;
    if (d.status === "verification") {
      items = [];
      selected = "";
      render();
      status(d.message || "请在地图页面完成人工验证", true);
      return;
    }
    if (!Array.isArray(d.candidates) || d.candidates.length > 20) return;
    const incoming = d.candidates.filter(
      (c) =>
        c &&
        c.provider === provider &&
        typeof c.poiid === "string" &&
        c.poiid &&
        typeof c.name === "string"
    );
    if (d.mode === "search") {
      items = incoming;
      selected = items[0]?.poiid || "";
    } else if (d.mode === "detail") {
      for (const c of incoming) {
        const old = items.find((x) => x.poiid === c.poiid);
        const merged = {
          ...old,
          ...c,
          source_geometry: c.source_geometry || old?.source_geometry,
          raw_boundary: c.raw_boundary || old?.raw_boundary,
          source_field: c.source_geometry ? c.source_field : old?.source_field,
          source_quality: c.source_geometry
            ? c.source_quality
            : old?.source_quality || c.source_quality,
          address: c.address || old?.address,
          city: c.city || old?.city,
          typecode: c.typecode || old?.typecode,
          source_attributes: {
            category:
              c.source_attributes?.category ||
              old?.source_attributes?.category ||
              "",
            phone:
              c.source_attributes?.phone || old?.source_attributes?.phone || ""
          }
        };
        items = [merged, ...items.filter((x) => x.poiid !== c.poiid)].slice(
          0,
          20
        );
        selected = c.poiid;
      }
    }
    render();
  });
  window.addEventListener("__aoiSaveResult", (e) => {
    const p = pending.get(e.detail?.jobId);
    if (p) {
      pending.delete(e.detail.jobId);
      clearTimeout(p.timer);
      p.resolve(e.detail.result);
    }
  });
  function save(c) {
    if (web)
      return new Promise((resolve, reject) => {
        const jobId = crypto.randomUUID();
        const timer = setTimeout(() => {
          pending.delete(jobId);
          reject(Error("本地工具未响应，请确认服务和采集窗口仍打开"));
        }, 30000);
        pending.set(jobId, { resolve, timer });
        const box = window.__aoiWebOutbox || (window.__aoiWebOutbox = []);
        if (box.length >= 20) {
          clearTimeout(timer);
          pending.delete(jobId);
          reject(Error("待保存请求过多"));
          return;
        }
        box.push({ jobId, candidate: c });
      });
    return new Promise((resolve, reject) =>
      chrome.runtime.sendMessage(
        { type: "SAVE_CANDIDATE", candidate: c },
        (r) => {
          if (chrome.runtime.lastError)
            reject(Error(chrome.runtime.lastError.message));
          else resolve(r);
        }
      )
    );
  }
  $(".save").onclick = async () => {
    const c = items.find((x) => x.poiid === selected);
    if (!c || saving) return;
    try {
      C.normalize(c);
      saving = true;
      render();
      const r = await save(c);
      if (!r?.ok) throw Error(r?.error || "保存失败");
      status(
        "已保存「" +
          c.name +
          "」" +
          (r.warnings?.length ? " · " + r.warnings.join("；") : ""),
        !!r.warnings?.length
      );
    } catch (e) {
      status("未保存：" + e.message, true);
    } finally {
      saving = false;
      $(".save").disabled = !c.source_geometry;
      $(".save").textContent =
        provider === "tencent" ? "保存地点（无边界）" : "采集当前边界";
    }
  };
  window.postMessage({ channel: "AOI_COLLECTOR_V2_READY" }, location.origin);
  render();
})();
