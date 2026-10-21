# Output reference

[English README](../README.md) · [中文](OUTPUTS.zh-CN.md) · [Usage guide](USAGE.en.md)

## Export scope

The bottom-bar GeoJSON, CSV, and full-backup buttons export **all saved records**, regardless of the current search or provider filter. In Web, **下载 SHP 套件** downloads the **selected record**.

| Download | Contents | Intended use |
| --- | --- | --- |
| `aoi.geojson` | A FeatureCollection of normalized geometry and descriptive properties | GIS and mapping applications |
| `aoi.csv` | UTF-8 with BOM; one row per record, with geometry encoded as JSON text | Spreadsheet review and attribute processing |
| `aoi-backup.json` | A version-2 envelope with `schema_version`, `exported_at`, and `records` | Full restoration and extension ↔ Web transfer |
| `aoi-files.zip` | One Web record's Shapefile, GeoJSON, complete record, and notes | An individual result package |

Exported coordinates are **WGS-84, [longitude, latitude] in degrees**. The conversions from GCJ-02 / Baidu coordinates are approximate.

## GeoJSON properties

Amap and Baidu records contain supported Polygon / MultiPolygon geometry; Tencent records contain Point geometry. A combined collection may mix geometry types. Some GIS programs load them as separate layers.

| Property | Meaning |
| --- | --- |
| `NAME`, `PROVIDER`, `POIID` | Place name, source (`gaode`, `baidu`, `tencent`), and provider's place ID |
| `ADDRESS`, `ADDRESS_POIINFO`, `ADDRESS_DETAIL`, `CITY_NAME` | Available address and city information; `ADDRESS_POIINFO` mirrors `ADDRESS` |
| `LONGITUDE`, `LATITUDE` | Converted WGS-84 **center coordinates**, not a listing of boundary vertices |
| `KIND` | `aoi` for an area, `poi` for a place point |
| `TYPECODE`, `BIG_CATEGORY`, `MID_CATEGORY`, `SUB_CATEGORY` | Amap category code and available mapped category labels |
| `CATEGORY`, `PHONE` | Source category and phone, when provided; missing data stays empty |
| `SOURCE_CRS` | Original coordinate system: `WGS84`, `GCJ02`, `BD09LL`, or `BD09MC` |
| `SOURCE_PRECISE` | Source precision flag: `0` means marked non-precise, `1` means marked precise, `null` means unavailable; neither value establishes survey accuracy |
| `WARNINGS` | Quality or support warnings, joined as text |
| `CREATED_AT` | Timestamp recorded when the record is normalized/saved |

The GeoJSON Feature `id` uses `provider:place-id`. Original geometry is preserved in the **full backup**, not the normalized GeoJSON geometry.

The model/export layer supports validated polygon holes and MultiPolygons. This does not mean every map adapter can decode every source format: Baidu's verified source encoding currently covers a single ring.

## CSV columns

```text
NAME, PROVIDER, POIID, ADDRESS, CITY_NAME, KIND,
LONGITUDE, LATITUDE, CATEGORY, PHONE, SOURCE_CRS,
SOURCE_PRECISE, WARNINGS, GEOMETRY_WGS84
```

`GEOMETRY_WGS84` contains a JSON geometry object in a quoted CSV cell. Preserve place IDs as text when importing into a spreadsheet, especially Tencent's long numeric IDs. CSV is useful for inspection but is not a restorable full backup.

## Full backup

The backup retains each record's `source_geometry`, `source_center`, `source_crs`, `source_field`, available `raw_boundary`, `source_attributes`, `source_quality`, normalized `geometry`, `center`, warnings, and other record attributes.

Use **恢复备份** (Restore backup) in either workbench. The current importer accepts up to **500 records and 20 MB per file** and updates records with the same provider and ID. Export does not enforce those restore limits: split a larger backup as described in the [guide](USAGE.en.md#backup-and-transfer), and retain the original.

## Web result package

A selected record's `aoi-files.zip` contains:

```text
boundary.shp
boundary.shx
boundary.dbf
boundary.prj
boundary.cpg
boundary.geojson
record.json
说明.txt
```

- `.shp`: geometry; area records use polygon shapes, Tencent records use a point.
- `.shx`: geometry index; `.dbf`: attributes.
- `.prj`: WGS-84 CRS declaration; `.cpg`: UTF-8 encoding declaration.
- `boundary.geojson`: a single-record FeatureCollection.
- `record.json`: the complete normalized record, including original source geometry.
- `说明.txt`: human-readable source, place ID, source/export CRS, and warnings.

The DBF fields are `NAME`, `PROVIDER`, `POIID`, `ADDRESS`, `CITY_NAME`, `LONGITUDE`, `LATITUDE`, and `PRECISE`. Some text fields are length-limited. The ZIP's GeoJSON and `record.json` carry richer properties than DBF, including source category/phone and warning text.

## Where Web stores results

By default, the data directory is the project directory. Set `AOI_DATA_DIR` before startup to use another location.

```text
<data-directory>/
├── aoi.sqlite
└── output/
    └── <provider>/
        └── <record-key>/
            └── <version-id>/
                ├── boundary.shp / .shx / .dbf / .prj / .cpg
                ├── boundary.geojson
                ├── record.json
                └── 说明.txt
```

Each save creates a new output version. The database points to the current record; earlier folders remain. Deleting in Web hides the record from the workbench and aggregate exports while retaining its historical files. Downloading a record package uses the current version.

Extension records use IndexedDB within the current extension/browser profile. They do not appear in the Web data directory; use full backup and restore to transfer them.

## Check before analysis

Verify the place name/ID, geometry type, source quality, and CRS against your intended use. For area or distance calculations, use a suitable projected CRS. A valid polygon is not evidence of a cadastral boundary or survey precision.
