(() => {
  "use strict";
  if (window.__aoiHookV2) return;
  window.__aoiHookV2 = true;
  const C = window.AOICore,
    provider = C?.providerFor(location.href);
  if (!provider) return;
  let serial = 0,
    lastSearch = 0,
    latest = null;
  const meta = new WeakMap(),
    bound = new WeakSet();
  const relevant = (u) => {
    try {
      const x = new URL(typeof u === "string" ? u : u.url, location.href);
      if (provider === "gaode")
        return (
          /(^|\.)(gaode|amap)\.com$/.test(x.hostname) &&
          (/poiInfo/i.test(x.pathname) ||
            x.pathname.includes("/detail/get/detail") ||
            /getPoiDetail|getDeepInfoPoi/.test(x.pathname))
        );
      if (provider === "baidu")
        return (
          x.hostname === "map.baidu.com" &&
          ["s", "detailConInfo"].includes(x.searchParams.get("qt"))
        );
      return (
        x.hostname === "mmapgwpc.map.qq.com" && x.pathname === "/mapsearch"
      );
    } catch {
      return false;
    }
  };
  function emit(url, text, seq, status) {
    try {
      if (status === 419 || status === 403) {
        window.postMessage(
          {
            channel: "AOI_COLLECTOR_V2",
            provider,
            status: "verification",
            message: "地图请求受限，请在原页面完成验证"
          },
          location.origin
        );
        return;
      }
      if (typeof text !== "string" || text.length > 8000000) return;
      const result = C.parseResponse(provider, url, text);
      if (!result) return;
      if (result.mode === "search") {
        if (seq < lastSearch) return;
        lastSearch = seq;
      }
      latest = { channel: "AOI_COLLECTOR_V2", provider, ...result };
      window.postMessage(latest, location.origin);
    } catch (e) {
      console.debug("[AOI] 响应无法解析", e.message);
    }
  }
  window.addEventListener("message", (e) => {
    if (
      e.source === window &&
      e.origin === location.origin &&
      e.data?.channel === "AOI_COLLECTOR_V2_READY" &&
      latest
    )
      window.postMessage(latest, location.origin);
  });
  const originalFetch = window.fetch;
  window.fetch = function (input, ...args) {
    const url = typeof input === "string" ? input : input?.url,
      seq = ++serial;
    const promise = originalFetch.call(this, input, ...args);
    if (relevant(url))
      promise
        .then((response) => {
          if (Number(response.headers.get("content-length") || 0) > 8000000)
            return;
          return response
            .clone()
            .text()
            .then((t) => emit(url, t, seq, response.status));
        })
        .catch(() => {});
    return promise;
  };
  const open = XMLHttpRequest.prototype.open,
    send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    const result = open.call(this, method, url, ...args);
    meta.set(this, { url: String(url), seq: ++serial });
    return result;
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (!bound.has(this)) {
      bound.add(this);
      this.addEventListener("load", () => {
        const m = meta.get(this);
        if (!m || !relevant(m.url)) return;
        try {
          const text =
            this.responseType === "json"
              ? JSON.stringify(this.response)
              : !this.responseType || this.responseType === "text"
                ? this.responseText
                : "";
          emit(m.url, text, m.seq, this.status);
        } catch {}
      });
    }
    return send.apply(this, args);
  };
})();
