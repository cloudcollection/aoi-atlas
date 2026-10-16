import os
import json
import urllib.request
from urllib.parse import urlparse
import websocket
import shutil
import subprocess
import threading
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.edge.service import Service as EdgeService
from selenium.webdriver.chrome.service import Service as ChromeService

URLS = {
    "gaode": "https://www.amap.com/",
    "baidu": "https://map.baidu.com/",
    "tencent": "https://map.qq.com/",
}
BASE = Path(__file__).resolve().parent


class BrowserController:
    def __init__(self, save):
        self.driver = None
        self.lock = threading.RLock()
        self.tabs = set()
        self.save = save
        self.stop = threading.Event()
        self.error = ""
        self.debugger = None
        self.worker = threading.Thread(target=self._poll, daemon=True)
        self.worker.start()

    def launch(self):
        with self.lock:
            if self.driver:
                try:
                    self.driver.window_handles
                    return
                except Exception:
                    self.driver = None
            temp = Path(
                os.environ.get("AOI_TEMP_DIR", str(BASE / ".runtime"))
            ).resolve()
            temp.mkdir(parents=True, exist_ok=True)
            os.environ["SE_CACHE_PATH"] = str(temp / "selenium-cache")
            os.environ["SE_AVOID_STATS"] = "true"
            if os.name == "nt" and not os.environ.get("SE_PROXY"):
                try:
                    import winreg

                    with winreg.OpenKey(
                        winreg.HKEY_CURRENT_USER,
                        r"Software\Microsoft\Windows\CurrentVersion\Internet Settings",
                    ) as k:
                        if winreg.QueryValueEx(k, "ProxyEnable")[0]:
                            os.environ["SE_PROXY"] = winreg.QueryValueEx(
                                k, "ProxyServer"
                            )[0]
                except OSError:
                    pass
            candidates = [
                os.environ.get("AOI_BROWSER_BINARY"),
                shutil.which("msedge"),
                r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                shutil.which("google-chrome"),
                shutil.which("chromium"),
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            ]
            binary = next((p for p in candidates if p and Path(p).exists()), None)
            if not binary:
                raise RuntimeError(
                    "未找到 Edge / Chrome / Chromium，请设置 AOI_BROWSER_BINARY"
                )
            edge = "edge" in binary.lower()
            options = EdgeOptions() if edge else ChromeOptions()
            options.binary_location = binary
            profile = Path(
                os.environ.get("AOI_BROWSER_PROFILE", str(temp / "browser-profile"))
            ).resolve()
            profile.mkdir(parents=True, exist_ok=True)
            options.add_argument("--user-data-dir=" + str(profile))
            options.add_argument("--no-first-run")
            options.add_argument("--window-size=1440,1000")
            options.add_argument("--disable-extensions")
            if os.environ.get("AOI_HEADLESS") == "1":
                options.add_argument("--headless=new")
            service = (EdgeService if edge else ChromeService)(
                log_output=subprocess.DEVNULL
            )
            if os.name == "nt":
                service.creation_flags = subprocess.CREATE_NO_WINDOW
            self.driver = (webdriver.Edge if edge else webdriver.Chrome)(
                options=options, service=service
            )
            self.driver.set_page_load_timeout(45)
            self.error = ""
            self.debugger = self.driver.capabilities.get(
                "ms:edgeOptions", self.driver.capabilities.get("goog:chromeOptions", {})
            ).get("debuggerAddress")

    def bundle(self):
        import json

        config = "window.__AOI_WEB_CONFIG=" + json.dumps({"mode": "web"}) + ";\n"
        return config + "\n".join(
            (BASE / "aoiCollectorJs" / p).read_text(encoding="utf-8-sig")
            for p in ("core.js", "hook.js", "panel.js")
        )

    def open_collect_tab(self, provider):
        if provider not in URLS:
            raise ValueError("未知地图来源")
        with self.lock:
            self.launch()
            d = self.driver
            d.switch_to.new_window("tab")
            handle = d.current_window_handle
            script = self.bundle()
            d.execute_cdp_cmd(
                "Page.addScriptToEvaluateOnNewDocument", {"source": script}
            )
            self.tabs.add(handle)
            d.get(URLS[provider])
            d.execute_script(script)

    @property
    def alive(self):
        with self.lock:
            try:
                return bool(self.driver and self.driver.window_handles)
            except Exception:
                return False

    @staticmethod
    def _cdp(socket, method, params):
        socket.send(json.dumps({"id": 1, "method": method, "params": params}))
        while True:
            response = json.loads(socket.recv())
            if response.get("id") == 1:
                if "error" in response:
                    raise RuntimeError(response["error"].get("message", "CDP错误"))
                return response.get("result", {})

    def _poll(self):
        # Talk directly to this browser's page targets, without changing the user's active tab.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        while not self.stop.wait(0.8):
            if not self.debugger or not self.tabs:
                continue
            try:
                with opener.open(
                    "http://" + self.debugger + "/json/list", timeout=3
                ) as response:
                    targets = json.load(response)
                wanted = {h.removeprefix("CDwindow-") for h in self.tabs}
                for target in targets:
                    if target.get("type") != "page" or target.get("id") not in wanted:
                        continue
                    host = urlparse(target.get("url", "")).hostname or ""
                    provider = (
                        "baidu"
                        if host == "map.baidu.com"
                        else (
                            "tencent"
                            if host == "map.qq.com"
                            else (
                                "gaode"
                                if host in ("amap.com", "gaode.com")
                                or host.endswith((".amap.com", ".gaode.com"))
                                else None
                            )
                        )
                    )
                    if not provider:
                        continue
                    socket = websocket.create_connection(
                        target["webSocketDebuggerUrl"], timeout=5, suppress_origin=True
                    )
                    try:
                        result = self._cdp(
                            socket,
                            "Runtime.evaluate",
                            {
                                "expression": "JSON.stringify((window.__aoiWebOutbox||[]).splice(0,20))",
                                "returnByValue": True,
                            },
                        )
                        jobs = json.loads(result.get("result", {}).get("value", "[]"))
                        for job in jobs:
                            if not isinstance(job, dict) or not isinstance(
                                job.get("jobId"), str
                            ):
                                continue
                            try:
                                if job.get("candidate", {}).get("provider") != provider:
                                    raise ValueError("地图来源不匹配")
                                record = self.save(job.get("candidate"))
                                saved = {
                                    "ok": True,
                                    "id": record["id"],
                                    "warnings": record["warnings"],
                                }
                            except Exception as e:
                                saved = {"ok": False, "error": str(e)}
                            payload = json.dumps(
                                {"jobId": job["jobId"], "result": saved},
                                ensure_ascii=True,
                            )
                            self._cdp(
                                socket,
                                "Runtime.evaluate",
                                {
                                    "expression": "window.dispatchEvent(new CustomEvent('__aoiSaveResult',{detail:"
                                    + payload
                                    + "}))"
                                },
                            )
                    finally:
                        socket.close()
                self.error = ""
            except Exception as e:
                self.error = str(e)[:160]

    def quit(self):
        self.stop.set()
        with self.lock:
            if self.driver:
                try:
                    self.driver.quit()
                except Exception:
                    pass
                self.driver = None
