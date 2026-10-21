# AOI Atlas

**Collect place boundaries from Amap and Baidu Maps. Keep the source. Take the data into GIS.**

[English](README.md) · [简体中文](README.zh-CN.md)

[Download](https://github.com/cloudcollection/aoi-atlas/releases/latest) · [Step-by-step guide](docs/USAGE.en.md) · [Report an issue](https://github.com/cloudcollection/aoi-atlas/issues)

![Version](https://img.shields.io/github/v/release/cloudcollection/aoi-atlas)
![Checks](https://github.com/cloudcollection/aoi-atlas/actions/workflows/validate.yml/badge.svg)

A campus, park, or library is more than a pin. AOI Atlas helps you save the boundary a map page actually returns, inspect it locally, and export it for your next map or analysis.

Use the **Chrome / Edge extension** for everyday collection, or the **local Web workbench** when you also need Shapefiles. Tencent Maps has experimental **place-point support only**. The interface is currently in Chinese; the English guide includes the button labels you will see.

![AOI Atlas extension workbench with saved places, boundary preview, source labels, and export controls](docs/images/extension-workbench.png)

## Contents

- [What you can do](#what-you-can-do)
- [Map support](#map-support)
- [Get started](#get-started)
- [Collect your first boundary](#collect-your-first-boundary)
- [Run the local Web workbench](#run-the-local-web-workbench)
- [What files do you get?](#what-files-do-you-get)
- [Coordinates and data quality](#coordinates-and-data-quality)
- [Common questions](#common-questions)
- [Contribute](#contribute)
- [Credits and licensing](#credits-and-licensing)

## What you can do

- **Build a small study-area collection.** Save available campus, park, building, or facility boundaries for fieldwork and mapping.
- **Prepare data for QGIS or ArcGIS.** Export GeoJSON, or use the Web workbench to download a Shapefile package for an individual record.
- **Compare map sources.** Keep the provider, place ID, original geometry, and quality flags so you can check where a boundary came from.
- **Organize places in a table.** Export names, addresses, coordinates, and available source categories or phone numbers as CSV.
- **Move work between extension and Web.** Export a full JSON backup and restore it in the other workbench.

Spatial joins, buffers, area calculations, and publication maps are downstream tasks in your GIS software. AOI Atlas provides the collected data.

## Map support

| Source | Current support | What to expect |
| --- | --- | --- |
| Amap / Gaode | AOI boundaries | Saves a boundary when the page returns one; not every place has an AOI. |
| Baidu Maps | AOI boundaries | Supports the verified single-ring source encoding and preserves the source precision flag. Unverified multi-ring encodings are rejected. |
| Tencent Maps | Experimental POI points | Saves place information from search or a standalone detail page. Native AOI polygons are not supported. |

**AOI** means an area of interest: a polygon describing a place. **POI** means a point of interest: a location and its attributes. A point or bounding box is never turned into a substitute AOI.

## Get started

The extension is the quickest route. You need a recent **Chrome or Edge** browser (Chromium 111+); Python and Node.js are not required.

1. Open [Releases](https://github.com/cloudcollection/aoi-atlas/releases/latest). Under **Assets**, download the ZIP whose name ends in **`-extension.zip`**, then extract it.
2. Open `chrome://extensions/` or `edge://extensions/` and turn on **Developer mode**.
3. Click **Load unpacked** and select the extracted **`aoiCollectorJs`** folder, which contains `manifest.json`.
4. Refresh any map tabs you already had open. Open the extension icon, then its workbench.
5. Choose a map and follow the example below.

Keep the extracted folder in place while the extension is installed. Use the release attachment, not GitHub's automatically generated source archive, for this route.

## Collect your first boundary

Try **Guangzhou Library / 广州图书馆** on Baidu Maps. This place has previously returned a boundary; map responses can change.

1. Open [Baidu Maps](https://map.baidu.com/), search for **广州图书馆**, and click the specific place result.
2. In the collection panel on the right, check the name, address, and source. If several candidates appear, select the intended one.
3. Once a boundary is available, click **采集当前边界** (Collect current boundary). Wait for **已保存** (Saved).
4. Open the extension workbench and select the saved record. Check the outline and any quality warnings.
5. Click **导出 GeoJSON** (Export GeoJSON) for GIS, **导出 CSV** (Export CSV) for a table, or **完整备份** (Full backup) to preserve the complete record.

The documented library example carries `is_precise=0`: the provider marks it as non-precise. Keep that warning when deciding how to use the outline.

![Baidu Maps collection panel for Guangzhou Library showing its source boundary and quality warning](docs/images/baidu-extension.png)

For a point-only example, search **深圳人才公园** on [Tencent Maps](https://map.qq.com/) and click **保存地点（无边界）** (Save place, no boundary).

The [full guide](docs/USAGE.en.md) covers Web collection, backup transfer, GIS import, and troubleshooting.

## Run the local Web workbench

Choose this route for local file storage and Shapefile exports. You need **Python 3.10+**, **Edge / Chrome**, and an internet connection for dependencies, the browser driver, and map pages.

1. From [Releases](https://github.com/cloudcollection/aoi-atlas/releases/latest), download the ZIP ending in **`-source.zip`**.
2. Extract it to a data-drive folder on Windows, such as `D:\AOI-Atlas`. Open PowerShell in the extracted project folder, where `start.ps1` lives.
3. Start the workbench:

   ```powershell
   .\start.ps1
   ```

4. Visit **http://127.0.0.1:9224/**. Click **打开地图** (Open map) to launch the separate collection browser.
5. Search, inspect, and save a place in that browser. Return to the workbench and click **刷新** (Refresh).
6. Select a record and click **下载 SHP 套件** (Download SHP package), or use the bottom bar for GeoJSON, CSV, and backups.

The launcher installs the Python dependencies on first run. Keep it running during collection; press `Ctrl+C` to stop the service. Windows is the documented tested environment. See the [manual setup and configuration](docs/USAGE.en.md#manual-setup-and-configuration) for other environments.

![Local Web workbench showing a saved boundary and the per-record Shapefile download](docs/images/web-workbench.png)

## What files do you get?

| File | Available in | Use it for |
| --- | --- | --- |
| `aoi.geojson` | Extension + Web | All saved records as a WGS-84 FeatureCollection. Open it in QGIS, ArcGIS, or a mapping library. It can contain both polygons and Tencent points. |
| `aoi.csv` | Extension + Web | A UTF-8 table with names, sources, place IDs, center coordinates, quality warnings, and geometry as JSON text. |
| `aoi-backup.json` | Extension + Web | Restore or transfer complete records, including original geometry, source coordinates, quality flags, and collection time. |
| `aoi-files.zip` | Web, selected record | `boundary.shp/.shx/.dbf/.prj/.cpg`, `boundary.geojson`, `record.json`, and `说明.txt`. Keep the Shapefile sidecar files together. |

**Search and source filters only change the list. GeoJSON, CSV, and full-backup exports include all saved records.** The SHP button downloads the selected record.

Extension and Web keep separate local collections. To transfer records, export a full backup and restore it in the other workbench.

See the [output reference](docs/OUTPUTS.md) for fields, folder layout, and geometry handling.

## Coordinates and data quality

- Exported geometry and center coordinates use **WGS-84 longitude, latitude**. Conversion from GCJ-02 or Baidu coordinates is approximate.
- `SOURCE_CRS` describes the **original** coordinates; it does not change the export coordinate system.
- A provider's outline may describe a site rather than a building footprint. Geometry validity and a precision flag do not establish survey accuracy or legal boundaries.
- Use a suitable projected CRS in GIS before measuring area or distance. Inspect the source and outline before using them in research.
- Collection depends on what the map page returns. Complete any login or verification on the map page and follow the provider's usage and data terms.

## Common questions

**Why is the save button disabled?**

Click a specific place result, not just the map. If the page does not return a supported boundary, there is no AOI to save. See [troubleshooting](docs/USAGE.en.md#troubleshooting).

**Why does Tencent export a point?**

That is the current supported record type. A search-result extent is not treated as an AOI.

**Why is the preview a coordinate grid?**

The workbench starts with a local WGS-84 grid. You can switch to an online basemap; if it fails, the preview falls back to the grid.

**Do same-name places overwrite each other?**

Records are identified by **provider + place ID**. Saving the same ID updates its current record. The Web version also retains earlier output folders.

**How do I keep my data when changing browsers or reinstalling?**

Export **完整备份** first. A different extension ID or browser profile cannot automatically read the old extension's storage. Restore accepts at most **500 records and 20 MB per file**; see [backup and transfer](docs/USAGE.en.md#backup-and-transfer) for larger collections.

## Contribute

Useful contributions include a reproducible map-compatibility report, a clearer tutorial, a translation, or a parser fix. [Open an issue](https://github.com/cloudcollection/aoi-atlas/issues) with the provider, public place name or ID, expected result, and actual behavior. Remove cookies, tokens, and private browser data from attachments.

See [CONTRIBUTING.md](CONTRIBUTING.md) for local checks and contribution steps. If the tool helps your work, a star makes it easier for others to find.

## Credits and licensing

The original Amap collection approach was informed by [eqeqeqr/aoiCollector](https://github.com/eqeqeqr/aoiCollector). Baidu and Tencent adapters, the shared data model, workbenches, migration, and versioned outputs are maintained in this project.

There is currently **no repository-wide license grant**; the referenced upstream did not provide a clear project license when checked. See [third-party notices](THIRD_PARTY_NOTICES.md) for component licenses and attribution. Map data and trademarks remain subject to their owners' terms.
