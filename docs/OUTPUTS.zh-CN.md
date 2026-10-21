# 结果文件参考

[中文 README](../README.zh-CN.md) · [English](OUTPUTS.md) · [使用教程](USAGE.md)

## 导出范围

底部的 GeoJSON、CSV、完整备份按钮导出**全部已保存记录**，不受搜索或来源筛选影响。Web 详情中的 **下载 SHP 套件** 只下载**当前选中记录**。

| 下载文件 | 内容 | 用途 |
| --- | --- | --- |
| `aoi.geojson` | 标准化几何和属性组成的 FeatureCollection | GIS 分析和地图程序 |
| `aoi.csv` | UTF-8 BOM 表格，每条记录一行，几何以 JSON 文本存储 | 表格核查与属性整理 |
| `aoi-backup.json` | 含 `schema_version`、`exported_at`、`records` 的版本 2 备份 | 完整恢复、扩展与 Web 相互转移 |
| `aoi-files.zip` | Web 中单条记录的 Shapefile、GeoJSON、完整记录和说明 | 单条成果文件包 |

导出坐标统一为 **WGS-84，经度在前、纬度在后，单位为度**。GCJ-02 和百度坐标的转换为近似转换。

## GeoJSON 属性

高德和百度记录包含受支持的 Polygon / MultiPolygon；腾讯为 Point。一个合集可能混合点和面，部分 GIS 软件会将它们分成不同图层加载。

| 字段 | 含义 |
| --- | --- |
| `NAME`、`PROVIDER`、`POIID` | 名称、来源（`gaode` / `baidu` / `tencent`）及来源地点 ID |
| `ADDRESS`、`ADDRESS_POIINFO`、`ADDRESS_DETAIL`、`CITY_NAME` | 来源提供的地址和城市；`ADDRESS_POIINFO` 与 `ADDRESS` 相同 |
| `LONGITUDE`、`LATITUDE` | 转换后的 WGS-84 **中心点**，不是全部边界顶点 |
| `KIND` | `aoi` 表示区域面，`poi` 表示地点 |
| `TYPECODE`、`BIG_CATEGORY`、`MID_CATEGORY`、`SUB_CATEGORY` | 高德分类编码及可映射的分类名称 |
| `CATEGORY`、`PHONE` | 来源提供的分类和电话；缺失时为空 |
| `SOURCE_CRS` | 原始坐标系：`WGS84`、`GCJ02`、`BD09LL` 或 `BD09MC` |
| `SOURCE_PRECISE` | 来源精确性标记：`0` 为标记非精确，`1` 为标记精确，`null` 为未提供；均不构成测绘精度承诺 |
| `WARNINGS` | 拼接成文本的质量提示或支持限制 |
| `CREATED_AT` | 记录规范化 / 保存时写入的时间戳 |

GeoJSON Feature 的 `id` 使用 `来源:地点ID`。原始几何保存在**完整备份**中；GeoJSON 的 geometry 是转换后的标准化几何。

数据模型和导出层支持通过校验的孔洞与多面，但不代表每个地图适配器都能解析所有来源格式；百度目前验证的是单环来源编码。

## CSV 列

```text
NAME, PROVIDER, POIID, ADDRESS, CITY_NAME, KIND,
LONGITUDE, LATITUDE, CATEGORY, PHONE, SOURCE_CRS,
SOURCE_PRECISE, WARNINGS, GEOMETRY_WGS84
```

`GEOMETRY_WGS84` 在带引号的单元格内保存 JSON 几何对象。将地点 ID 导入表格时按文本处理，尤其注意腾讯的长数字 ID，避免表格软件改变其值。CSV 适合核查，不能作为完整备份恢复。

## 完整备份

每条记录保留 `source_geometry`、`source_center`、`source_crs`、`source_field`、可用的 `raw_boundary`、`source_attributes`、`source_quality`，以及转换后的 `geometry`、`center`、提示和其他记录属性。

通过任一工作台的 **恢复备份** 导入。目前每个文件最多接受 **500 条记录、20 MB**，同来源同 ID 会更新。导出本身不限制在这一范围内；大备份请按 [教程](USAGE.md#备份与转移) 拆分后恢复，并保留原件。

## Web 单条结果包

选中记录下载的 `aoi-files.zip` 包含：

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

- `.shp`：几何；区域记录使用多边形，腾讯记录使用点。
- `.shx`：几何索引；`.dbf`：属性表。
- `.prj`：WGS-84 坐标系声明；`.cpg`：UTF-8 编码声明。
- `boundary.geojson`：只包含当前记录的 FeatureCollection。
- `record.json`：含原始来源几何的完整标准化记录。
- `说明.txt`：名称、来源、地点 ID、原始与导出坐标系、质量提示。

DBF 字段为 `NAME`、`PROVIDER`、`POIID`、`ADDRESS`、`CITY_NAME`、`LONGITUDE`、`LATITUDE`、`PRECISE`，部分文本字段有长度限制。包内 GeoJSON 和 `record.json` 比 DBF 保留更多属性，包括来源分类、电话和提示文本。

## Web 结果保存位置

默认数据目录为项目目录。需要更换时，在启动前设置 `AOI_DATA_DIR`。

```text
<数据目录>/
├── aoi.sqlite
└── output/
    └── <地图来源>/
        └── <记录键>/
            └── <版本ID>/
                ├── boundary.shp / .shx / .dbf / .prj / .cpg
                ├── boundary.geojson
                ├── record.json
                └── 说明.txt
```

每次保存会创建一个输出版本，数据库指向当前记录，以前的文件夹继续保留。Web 删除会让记录从工作台和合集导出中隐藏，历史文件仍保留；单条下载获取当前版本。

扩展将数据保存在当前扩展 / 浏览器配置的 IndexedDB 中，不会写入 Web 数据目录；需要通过完整备份和恢复转移。

## 分析前的核查

检查名称和 ID 是否对应目标、几何是点还是面、来源质量及坐标系是否满足用途。计算面积或距离应使用合适的投影。多边形几何有效不等于法定边界或测绘精度。
