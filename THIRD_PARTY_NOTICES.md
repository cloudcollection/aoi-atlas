# 来源与第三方组件

本项目基于 [eqeqeqr/aoiCollector](https://github.com/eqeqeqr/aoiCollector)，基线提交 `485731998e04a55d0f3ee2374c6bb0ad350dbf0b`，保留原提交历史和作者信息。原仓库在本次核对时未提供明确的项目 LICENSE 文件；本衍生版本不替上游授予许可，也不将整个项目重新声明为 MIT。使用与再分发前应确认相应权利。

- Leaflet 1.9.4：BSD 2-Clause，许可原文位于 `aoiCollectorJs/vendor/leaflet/LICENSE`。
- SheetJS：沿用上游随附的 `aoiCollectorJs/libs/xlsx.full.min.js`，其版权及许可声明保留在文件头。仅用于可选的高德分类表更新。
- 高德分类表、原图标和历史截图沿用上游，未将其声明为本次原创。
- OpenStreetMap 底图保留界面署名，在线底图需要网络，不打包或批量下载瓦片。
- 高德和三组百度测试样例来自用户正常网页操作返回的数据，仅保留验证所需的公开地点和来源边界，无认证参数或登录状态。其来源权利不随代码许可转移。

本次新增：三平台适配规范、坐标和几何校验、来源质量提示、扩展和 Web 管理界面、数据库迁移、文件导出与回归验证。
