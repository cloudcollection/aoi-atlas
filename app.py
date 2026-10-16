import asyncio
import io
import json
import os
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
import uvicorn
import storage
from geometry import feature

BASE = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = int(os.environ.get("AOI_PORT", "9224"))
browser = None


def get_browser():
    global browser
    if browser is None:
        from browser import BrowserController

        browser = BrowserController(storage.save)
    return browser


@asynccontextmanager
async def lifespan(app):
    storage.init_db()
    yield
    if browser:
        browser.quit()


app = FastAPI(title="AOI 多地图采集", version="2.1.0", lifespan=lifespan)
app.mount("/shared", StaticFiles(directory=BASE / "aoiCollectorJs"), name="shared")


@app.middleware("http")
async def local_only(request, call_next):
    host = request.headers.get("host", "").split(":")[0]
    if host not in ("127.0.0.1", "localhost", "testserver"):
        return JSONResponse({"error": "仅允许本机访问"}, status_code=403)
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        if origin and origin not in (
            f"http://127.0.0.1:{PORT}",
            f"http://localhost:{PORT}",
        ):
            return JSONResponse({"error": "不允许跨站修改本地数据"}, status_code=403)
        if request.headers.get("sec-fetch-site") == "cross-site":
            return JSONResponse({"error": "不允许跨站修改本地数据"}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.get("/", response_class=HTMLResponse)
@app.get("/preview", response_class=HTMLResponse)
async def home():
    html = (
        (BASE / "aoiCollectorJs" / "manager.html")
        .read_text(encoding="utf-8-sig")
        .replace("<head>", '<head><base href="/shared/">', 1)
    )
    return HTMLResponse(html)


@app.get("/favicon.ico")
async def favicon():
    return Response(status_code=204)


@app.get("/api/list")
async def api_list():
    return await asyncio.to_thread(storage.list_records)


@app.get("/api/detail")
async def api_detail(id: str = ""):
    r = await asyncio.to_thread(storage.get_record, id)
    if not r:
        raise HTTPException(404, "记录不存在")
    return r


async def read_json(request):
    body = await request.body()
    if len(body) > 5000000:
        raise HTTPException(413, "请求过大")
    try:
        return json.loads(body)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(400, "无效JSON")


@app.post("/api/report")
async def report(request: Request):
    try:
        r = await asyncio.to_thread(storage.save, await read_json(request))
        return {"ok": True, "id": r["id"], "warnings": r["warnings"]}
    except (ValueError, TypeError, KeyError) as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=400)


@app.post("/api/collect")
async def collect(request: Request):
    body = await read_json(request)
    provider = body.get("provider") if isinstance(body, dict) else None
    if provider not in ("gaode", "baidu", "tencent"):
        raise HTTPException(400, "未知地图来源")
    try:
        await asyncio.to_thread(get_browser().open_collect_tab, provider)
        return {"ok": True}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)[:250]}, status_code=503)


@app.delete("/api/records/{record_id:path}")
async def remove(record_id: str):
    if not await asyncio.to_thread(storage.delete, record_id):
        raise HTTPException(404, "记录不存在")
    return {"ok": True}


@app.get("/api/status")
async def status():
    return {
        "ok": True,
        "version": "2.1.0",
        "browser_alive": browser.alive if browser else False,
        "migration": await asyncio.to_thread(storage.migration_status),
    }


@app.get("/api/export")
async def export():
    records = await asyncio.to_thread(storage.list_records)
    return Response(
        json.dumps(
            {"type": "FeatureCollection", "features": [feature(r) for r in records]},
            ensure_ascii=False,
        ),
        media_type="application/geo+json",
        headers={"Content-Disposition": 'attachment; filename="aoi.geojson"'},
    )


@app.get("/api/files/{record_id:path}")
async def files(record_id: str):
    folder = await asyncio.to_thread(storage.folder_for, record_id)
    if not folder:
        raise HTTPException(404, "此记录暂无新版导出文件")

    def build_zip():
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
            for p in folder.iterdir():
                if p.is_file() and not p.is_symlink():
                    z.write(p, p.name)
        return out.getvalue()

    return Response(
        await asyncio.to_thread(build_zip),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="aoi-files.zip"'},
    )


if __name__ == "__main__":
    print(f"AOI 多地图采集：http://{HOST}:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
