"use strict";
chrome.runtime.sendMessage({ type: "GET_ALL" }, (r) => {
  document.getElementById("count").textContent = chrome.runtime.lastError
    ? "读取失败，请重新打开"
    : r?.ok
      ? "已保存 " + r.data.length + " 条记录"
      : r?.error || "读取失败";
});
document.getElementById("open").onclick = () =>
  chrome.tabs.create({ url: chrome.runtime.getURL("manager.html") });
