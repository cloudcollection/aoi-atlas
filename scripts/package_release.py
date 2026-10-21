"""Build distributable archives from the Git index, excluding local data and caches."""

import hashlib
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "releases"
VERSION = "2.1.2"


def files():
    raw = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT)
    paths = [Path(p.decode("utf-8")) for p in raw.split(b"\0") if p]
    forbidden = {
        ".git",
        ".venv",
        "node_modules",
        ".runtime",
        "output",
        "releases",
        "__pycache__",
    }
    for p in paths:
        if (
            forbidden.intersection(p.parts)
            or p.name.startswith(".env")
            or p.name.endswith((".sqlite", ".pyc", ".log"))
        ):
            raise ValueError(f"Local data unexpectedly staged: {p}")
        if (ROOT / p).is_symlink() or not (ROOT / p).is_file():
            raise ValueError(f"Expected regular source file: {p}")
    return paths


def build():
    paths = files()
    OUT.mkdir(exist_ok=True)
    source = OUT / f"aoi-atlas-{VERSION}-source.zip"
    extension = OUT / f"aoi-atlas-{VERSION}-extension.zip"
    with zipfile.ZipFile(source, "w", zipfile.ZIP_DEFLATED) as z:
        for p in paths:
            z.write(ROOT / p, (Path("aoi-atlas") / p).as_posix())
    with zipfile.ZipFile(extension, "w", zipfile.ZIP_DEFLATED) as z:
        for p in paths:
            if p.parts[0] == "aoiCollectorJs" or p.name == "THIRD_PARTY_NOTICES.md":
                z.write(ROOT / p, p.as_posix())
        z.writestr(
            "INSTALL.txt",
            f"AOI Atlas · 多地图采集 {VERSION}\n\n解压后打开 edge://extensions/ 或 chrome://extensions/，开启开发者模式，选择加载已解压的扩展，并选中 aoiCollectorJs 文件夹。刷新地图网页，正常搜索地点，再在浮窗确认并保存。通过扩展图标打开管理页预览、导出和备份。\n\n高德、百度：采集网页实际返回的来源边界。腾讯：实验支持，仅地点。登录及安全验证需在原网页手动完成。\n",
        )
    archives = [source, extension]
    hashes = []
    for p in archives:
        with zipfile.ZipFile(p) as z:
            assert z.testzip() is None
        digest = hashlib.sha256(p.read_bytes()).hexdigest()
        hashes.append(f"{digest}  {p.name}")
        print(f"{p.name}: {p.stat().st_size:,} bytes")
    (OUT / "SHA256SUMS.txt").write_text("\n".join(hashes) + "\n", encoding="utf-8")


if __name__ == "__main__":
    build()
