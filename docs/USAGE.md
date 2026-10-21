# 使用教程

[中文 README](../README.zh-CN.md) · [English guide](USAGE.en.md) · [结果文件参考](OUTPUTS.zh-CN.md)

## 选择使用方式

| 你想做的事 | 建议方式 |
| --- | --- |
| 在常用浏览器中逐个保存地点，导出 GeoJSON / CSV | Chrome / Edge 扩展，无需 Python |
| 将结果保存为本地文件，下载 Shapefile | 本地 Web，需要 Python 3.10+ |
| 把已有扩展结果转为 Shapefile | 导出完整备份，在 Web 中恢复，再下载单条 SHP 套件 |

当前界面为中文。Windows 是已有验证记录的环境；其他系统可按下文手动配置。

## 安装扩展

1. 进入 [Releases](https://github.com/cloudcollection/aoi-atlas/releases/latest)，展开 **Assets**。
2. 下载以 `-extension.zip` 结尾的附件并解压。当前 v2.1.2 的文件名是 `aoiCollector-multimap-2.1.2-extension.zip`。
3. 在 Chrome 地址栏输入 `chrome://extensions/`，或在 Edge 输入 `edge://extensions/`。
4. 打开 **开发者模式** → **加载已解压的扩展**，选择包含 `manifest.json` 的 **aoiCollectorJs** 文件夹。
5. 在浏览器的扩展菜单中找到工具；可将它固定到工具栏。
6. 刷新已打开的高德、百度或腾讯地图页，让采集浮窗生效。点击扩展图标，再点 **打开采集管理 →** 进入工作台。

扩展从该文件夹加载，安装后不要删除或移动它。源码方式安装时同样选择仓库内的 `aoiCollectorJs`。

## 完成一次采集

### 示例：百度地图的广州图书馆

1. 从工作台点击百度地图的 **打开地图 ↗**，或直接访问 [百度地图](https://map.baidu.com/)。
2. 搜索 **广州图书馆**，点击具体地点结果，打开详情。
3. 查看右侧浮窗中的名称和地址。多个候选时，在下拉框选择目标；每次保存前都核对一次。
4. 等待浮窗出现 **已捕获来源边界**。示例曾返回 12 点来源轮廓，且 `is_precise=0`，应显示非精确提示。实际返回以当时页面为准。
5. 点击 **采集当前边界**。只有出现 **已保存「广州图书馆」** 才算保存成功。
6. 打开扩展的采集管理页，选中记录，检查名称、地点 ID、来源坐标和质量提示，并预览轮廓。
7. 点击底部 **导出 GeoJSON ↓**。浏览器会保存 `aoi.geojson`；也可分别导出 CSV 和完整备份。

![广州图书馆的百度采集浮窗](images/baidu-extension.png)

高德操作相同：搜索名称 → 点击具体地点 → 确认浮窗 → 保存。部分地点只返回中心或没有边界，此时不能保存 AOI。

### 示例：腾讯地图的深圳人才公园

1. 打开 [腾讯地图](https://map.qq.com/)，搜索 **深圳人才公园**，点击地点详情；独立 `/poi/` 详情页也受支持。
2. 核对浮窗的名称和地址，点击 **保存地点（无边界）**。
3. 在工作台检查该记录为地点 Point。来源提供的分类和电话会随记录保留。
4. 按需导出。腾讯目前没有已支持的原生 AOI 面，导出 Point 是预期行为。

## 安装和使用本地 Web

1. 在 [Releases](https://github.com/cloudcollection/aoi-atlas/releases/latest) 下载以 `-source.zip` 结尾的附件。当前 v2.1.2 为 `aoiCollector-multimap-2.1.2-source.zip`。
2. 解压至 Windows 数据盘，例如 `D:\AOI-Atlas`，找到含 `app.py`、`requirements.txt` 和 `start.ps1` 的目录。
3. 安装 Python 3.10+ 和 Edge / Chrome，确保 `python --version` 能显示正确版本。
4. 在该目录打开 PowerShell，运行：

   ```powershell
   .\start.ps1
   ```

5. 首次启动需安装依赖和获取驱动，等待出现本地访问地址。打开 **http://127.0.0.1:9224/**。
6. 点击工作台某个地图的 **打开地图 ↗**。工具会打开独立的采集浏览器；请在这个窗口中搜索并保存。
7. 如需登录或验证，在地图原页面手动完成。保存成功后返回工作台点击 **刷新 ↻**。
8. 选中记录，点击详情中的 **下载 SHP 套件**，得到 `aoi-files.zip`。
9. 使用结束后，在启动窗口按 `Ctrl+C` 停止服务。

扩展与 Web 的存储各自独立。仅在普通浏览器中打开地图，不会自动把记录送入 Web。采集时保持本地服务和工具打开的浏览器运行。

### 手动启动与配置

脚本不可用时，可在项目目录直接创建环境并启动。Windows PowerShell 示例：

```powershell
$env:TEMP = Join-Path $PWD ".runtime"
$env:TMP = $env:TEMP
$env:AOI_TEMP_DIR = $env:TEMP
$env:PIP_CACHE_DIR = Join-Path $env:TEMP "pip-cache"
$env:PYTHONDONTWRITEBYTECODE = "1"
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

macOS / Linux 的手动启动示例（不代表已完成这些系统的在线采集验证）：

```bash
mkdir -p .runtime
export TMPDIR="$PWD/.runtime"
export AOI_TEMP_DIR="$PWD/.runtime"
export PIP_CACHE_DIR="$PWD/.runtime/pip-cache"
export PYTHONDONTWRITEBYTECODE=1
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python app.py
```

| 配置 | 用途 |
| --- | --- |
| `AOI_PORT` | Web 端口，默认 `9224` |
| `AOI_DATA_DIR` | 数据库与结果文件的存储目录，默认项目目录 |
| `AOI_TEMP_DIR` | Web 运行目录，默认项目内 `.runtime` |
| `AOI_BROWSER_BINARY` | 浏览器可执行文件的绝对路径；自动查找失败时指定 |
| `AOI_BROWSER_PROFILE` | 独立采集浏览器的配置目录；避免同时供多个浏览器进程使用 |

在运行 `app.py` 前设置环境变量。通过启动脚本更改端口或运行目录可使用：

```powershell
.\start.ps1 -Port 9334 -TempDir D:\AOI-Temp
```

此时访问 `http://127.0.0.1:9334/`。启动脚本要求项目和运行目录位于 C 盘以外的数据盘。服务仅监听本机。

## 管理与导出

- **搜索和来源筛选**：按名称、地址、地点 ID 或地图来源筛选列表。
- **预览**：选中记录查看轮廓和属性；默认坐标网格，可切换在线底图。
- **导出 GeoJSON / CSV / 完整备份**：每次导出全部已保存记录，列表筛选不会缩小导出范围。
- **下载 SHP 套件**：仅 Web 提供，下载当前选中记录的结果包。
- **重复保存**：同一来源和地点 ID 更新当前记录；同名但不同 ID 的地点各自保存。
- **删除**：扩展会移除本地记录；Web 隐藏当前记录并保留历史输出文件。删除前先做备份。

详细字段和包内文件见 [结果文件参考](OUTPUTS.zh-CN.md)。

### 在 QGIS 中使用

1. 将 `aoi.geojson` 拖入 QGIS，或通过“添加矢量图层”打开；文件同时含点和面时，按提示选择需要的几何类型。
2. 若使用 SHP，先完整解压 `aoi-files.zip`，将 `.shp`、`.shx`、`.dbf`、`.prj` 和 `.cpg` 放在同一目录，再加载 `boundary.shp`。
3. 查看属性表中的来源和质量字段。GeoJSON 坐标为 WGS-84；SHP 的 `.prj` 同样声明 WGS-84。
4. 需要测量时，另存为适合当地的投影坐标系后再计算。直接按经纬度做平面面积计算会得到错误量纲。

CSV 中 `GEOMETRY_WGS84` 是 JSON 文本，不会在表格中直接显示为轮廓。只需地点分布时，可用 `LONGITUDE` 和 `LATITUDE` 添加点图层。

## 备份与转移

1. 在原工作台点击 **完整备份**，保存 `aoi-backup.json`。
2. 在目标扩展或 Web 工作台点击 **恢复备份**，选择文件。
3. 核对恢复数量；确认后，同一来源和 ID 的记录会被更新。
4. 检查记录、轮廓和质量提示。扩展记录恢复至 Web 后，可以生成并下载 SHP 套件。

当前恢复限制为每个文件 **最多 500 条记录、20 MB**。较大的完整备份应先保留原件，再将其中 `records` 数组拆成多个满足限制的文件，每份保留 `schema_version`、`exported_at` 和 `records` 结构。不要以 CSV 或 GeoJSON 代替完整备份恢复。Web 恢复中途失败时，已成功保存的记录会保留；处理原因后可重试。

不同扩展 ID、浏览器配置及 Web 数据目录之间不会自动同步。更换版本或重新加载扩展前先备份。旧版数据会尝试迁移，失败项会提示；不同扩展 ID 下的旧数据仍需要先从原扩展导出。

## 故障排查

| 现象 | 检查方法 |
| --- | --- |
| 没有采集浮窗 | 确认扩展已启用，刷新地图页；Web 则在工作台点击“打开地图”，使用工具打开的窗口。 |
| 一直等待地点信息 / 保存按钮不可用 | 点击具体搜索结果并等待详情返回；检查是否需要人工验证。部分地点没有受支持的边界，不能凭地图上可见的轮廓判断。 |
| 出现多个相近名称 | 在浮窗手动选择，核对地址和来源，确认目标后再保存。 |
| 百度显示非精确边界 | 这是来源质量标记，不能通过转换坐标消除；用于分析前核对实际范围。 |
| 腾讯只显示地点 | 当前功能限制，尚不支持 AOI 面。 |
| 工作台为空 | 检查是否进入了另一浏览器配置 / 扩展 ID；Web 点击刷新，并确认数据原来保存在扩展还是 Web。 |
| 在线底图不可用 | 使用默认坐标网格继续检查轮廓，导出数据不依赖在线底图。 |
| 提示找不到浏览器 / 驱动获取失败 | 安装 Edge / Chrome，检查驱动下载网络；必要时设置 `AOI_BROWSER_BINARY`。不要同时打开使用同一采集配置目录的多个进程。 |
| PowerShell 阻止脚本运行 | 可直接使用上面的手动启动步骤，无需运行 `start.ps1`。 |
| 端口已被占用 | 用 `-Port` 指定其他端口，并访问相应地址。 |
| SHP 中文乱码或无法打开 | 完整解压并保留全部同名配套文件，确认使用 UTF-8 编码。 |
| 与国内在线底图有偏移 | 导出为 WGS-84，而底图可能使用 GCJ-02 / BD-09；先核对坐标体系，再判断边界。 |

仍无法解决时，请 [提交 Issue](https://github.com/cloudcollection/aoi-atlas/issues)，附上版本、系统、浏览器、地图来源、公开地点名或 ID、操作步骤和错误提示。不要附带 Cookie、认证参数或浏览器配置。
