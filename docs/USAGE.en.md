# Step-by-step guide

[English README](../README.md) · [中文教程](USAGE.md) · [Output reference](OUTPUTS.md)

## Choose a workflow

| Your task | Recommended route |
| --- | --- |
| Save individual places in your everyday browser; export GeoJSON / CSV | Chrome / Edge extension; no Python required |
| Store results as local files and download Shapefiles | Local Web workbench; Python 3.10+ required |
| Turn an extension collection into Shapefiles | Export a full backup, restore it in Web, then download each record's SHP package |

The interface is currently in Chinese. This guide includes the labels you will see. Windows is the documented tested environment; manual setup for other systems appears below.

## Install the extension

1. Open [Releases](https://github.com/cloudcollection/aoi-atlas/releases/latest) and expand **Assets**.
2. Download and extract the attachment ending in `-extension.zip`. For v2.1.2, it is `aoiCollector-multimap-2.1.2-extension.zip`.
3. In Chrome, open `chrome://extensions/`; in Edge, open `edge://extensions/`.
4. Enable **Developer mode** → **Load unpacked**, then select the **aoiCollectorJs** folder containing `manifest.json`.
5. Find the extension in the browser's extensions menu. Pin it to the toolbar if convenient.
6. Refresh existing Amap, Baidu, or Tencent Maps tabs. Click the extension icon, then **打开采集管理 →** (Open collection manager).

Keep the extracted folder where it is. If installing from source, select the same `aoiCollectorJs` directory inside the repository.

## Collect a place

### Example: Guangzhou Library on Baidu Maps

1. Click **打开地图 ↗** (Open map) on the Baidu card, or visit [Baidu Maps](https://map.baidu.com/).
2. Search for **广州图书馆** and click the specific place result to open its details.
3. Check the name and address in the collection panel on the right. Select the intended candidate from the dropdown if there are several.
4. Wait for **已捕获来源边界** (Source boundary captured). The documented example returned a 12-point outline with `is_precise=0`, so it showed a non-precise warning. The current response may differ.
5. Click **采集当前边界** (Collect current boundary). A successful save shows **已保存「广州图书馆」**.
6. Open the extension manager, select the record, and inspect the outline, place ID, source coordinates, and warnings.
7. Click **导出 GeoJSON ↓** (Export GeoJSON) to save `aoi.geojson`. CSV and full backup have separate buttons.

![Baidu Maps collection panel for Guangzhou Library](images/baidu-extension.png)

Amap follows the same sequence: search → click a specific place → inspect the panel → save. Some places return only a center or no boundary, so there is no AOI to save.

### Example: Shenzhen Talent Park on Tencent Maps

1. Visit [Tencent Maps](https://map.qq.com/), search **深圳人才公园**, and open the place details. Standalone `/poi/` pages are also supported.
2. Check the name and address, then click **保存地点（无边界）** (Save place, no boundary).
3. Inspect the Point record in the workbench. Category and phone attributes are retained when supplied by the source.
4. Export as needed. Tencent's native AOI polygons are not currently supported; a Point is the expected result.

## Install and use the local Web workbench

1. Download the attachment ending in `-source.zip` from [Releases](https://github.com/cloudcollection/aoi-atlas/releases/latest). For v2.1.2, it is `aoiCollector-multimap-2.1.2-source.zip`.
2. Extract it to a Windows data drive, such as `D:\AOI-Atlas`. Find the project directory containing `app.py`, `requirements.txt`, and `start.ps1`.
3. Install Python 3.10+ and Edge / Chrome. Check that `python --version` reports the intended Python.
4. Open PowerShell in the project directory and run:

   ```powershell
   .\start.ps1
   ```

5. The first run installs dependencies and may need to obtain a browser driver. Once the service starts, visit [http://127.0.0.1:9224/](http://127.0.0.1:9224/).
6. Click a provider's **打开地图 ↗** (Open map). Collect in the separate browser launched by the tool.
7. Complete any login or verification on the original map page. After saving, return to the workbench and click **刷新 ↻** (Refresh).
8. Select a record, then click **下载 SHP 套件** (Download SHP package) to save `aoi-files.zip`.
9. Press `Ctrl+C` in the launcher window when you want to stop the service.

Extension and Web storage are separate. Opening a map in an ordinary browser does not send records to Web. Keep the local service and its collection browser running while collecting.

### Manual setup and configuration

If the launcher is unavailable, create an environment and start the app directly. Windows PowerShell:

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

Manual macOS / Linux example (online collection on these systems has not been established by the project's recorded validation):

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

| Setting | Purpose |
| --- | --- |
| `AOI_PORT` | Web port; default `9224` |
| `AOI_DATA_DIR` | Database and result directory; defaults to the project directory |
| `AOI_TEMP_DIR` | Web runtime directory; defaults to `.runtime` in the project |
| `AOI_BROWSER_BINARY` | Absolute path to the browser executable if automatic discovery fails |
| `AOI_BROWSER_PROFILE` | Separate collection-browser profile; do not share it between concurrent browser processes |

Set environment variables before starting `app.py`. The PowerShell launcher also accepts:

```powershell
.\start.ps1 -Port 9334 -TempDir D:\AOI-Temp
```

Then visit `http://127.0.0.1:9334/`. The launcher requires the project and runtime directory to be on a drive other than C:. The service listens only on the local machine.

## Manage and export

- **Search / source filter**: narrow the list by name, address, place ID, or map provider.
- **Preview**: select a record to inspect its geometry and attributes. The default is a coordinate grid; an online basemap is optional.
- **导出 GeoJSON / 导出 CSV / 完整备份**: export all saved records. List filters do not restrict exports.
- **下载 SHP 套件**: Web only; downloads the selected record's result package.
- **Repeated saves**: the same provider and place ID update the current record. Same-name places with different IDs stay separate.
- **Delete**: extension deletion removes its local record. Web hides the current record and retains historical output files. Back up first.

See the [output reference](OUTPUTS.md) for fields and package contents.

### Open results in QGIS

1. Drag `aoi.geojson` into QGIS, or use Add Vector Layer. If it contains both points and polygons, choose the geometry type you need when prompted.
2. For SHP, fully extract `aoi-files.zip`. Keep `.shp`, `.shx`, `.dbf`, `.prj`, and `.cpg` together, then load `boundary.shp`.
3. Inspect the source and quality attributes. GeoJSON coordinates are WGS-84; the Shapefile's `.prj` also declares WGS-84.
4. For area or distance measurements, export to a suitable local projected CRS first. Planar measurements directly in longitude/latitude have the wrong units.

CSV's `GEOMETRY_WGS84` field contains JSON text, not a rendered outline. For a place-location layer, use `LONGITUDE` and `LATITUDE` as point coordinates.

## Backup and transfer

1. In the original workbench, click **完整备份** (Full backup) to save `aoi-backup.json`.
2. In the destination extension or Web workbench, click **恢复备份** (Restore backup) and select the file.
3. Check the record count. On confirmation, records with the same provider and ID are updated.
4. Inspect the restored records and warnings. Restoring extension records into Web also generates their SHP packages.

Restore accepts at most **500 records and 20 MB per file**. For larger backups, keep the original and split its `records` array into files within both limits, each retaining the `schema_version`, `exported_at`, and `records` structure. CSV and GeoJSON cannot replace a full backup for restoration. If a Web restore fails partway through, records already saved remain; resolve the cause and retry.

Different extension IDs, browser profiles, and Web data directories do not sync. Back up before replacing or reloading an extension. Legacy data migration is attempted and failures are reported; data under another extension ID still needs to be exported from that original extension first.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| No collection panel | Enable the extension and refresh the map page. For Web, use the collection browser opened by the workbench. |
| Waiting for place information / disabled save | Click a specific search result and wait for details; check for manual verification. Some places return no supported boundary, even if an outline is visible on the map. |
| Several similar names | Select the intended candidate in the panel and check its address and provider before saving. |
| Baidu non-precise warning | This is a source quality flag. Coordinate conversion does not remove that uncertainty; inspect the actual outline. |
| Tencent gives only a point | Current support is limited to POI records. |
| Empty workbench | Check the browser profile / extension ID. Refresh Web and confirm whether the records were originally saved in extension or Web storage. |
| Online basemap fails | Use the coordinate grid. Exporting saved data does not depend on a basemap. |
| Browser not found / driver download fails | Install Edge / Chrome and check network access for the driver. Set `AOI_BROWSER_BINARY` if needed. Avoid concurrent processes using the same collection profile. |
| PowerShell blocks the script | Use the manual setup above to run `app.py` directly. |
| Port already in use | Choose another `-Port` and use its matching URL. |
| SHP has garbled Chinese / will not open | Extract all same-name sidecar files together and use UTF-8. |
| Offset against a Chinese online basemap | Exports use WGS-84; the basemap may use GCJ-02 or BD-09. Check CRS compatibility before judging the outline. |

If the problem remains, [open an issue](https://github.com/cloudcollection/aoi-atlas/issues) with the version, OS, browser, provider, public place name or ID, reproduction steps, and error message. Do not attach cookies, authentication parameters, or browser profiles.
