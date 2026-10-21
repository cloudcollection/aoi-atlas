# Contributing / 参与改进

Small, reproducible fixes are welcome: map compatibility, parsing, export behavior, documentation, and translation.

欢迎改进地图兼容、解析、导出、文档和翻译。请尽量提供能复现的问题及范围明确的修复。

## Report a problem / 反馈问题

Include the release version, OS/browser, provider, public place name or ID, steps, expected result, and actual result. Remove cookies, tokens, login state, and private browser data from attachments.

请附版本、系统与浏览器、地图来源、公开地点名或 ID、复现步骤、预期和实际结果。附件请去除 Cookie、令牌、登录状态及私人浏览器数据。

## Local checks / 本地检查

Use Node.js 22 and Python 3.12 to match CI. Create a Python environment and activate it before running the commands. Place local caches and test outputs in a suitable data directory.

建议使用与 CI 一致的 Node.js 22、Python 3.12。先创建并激活 Python 环境，将缓存和测试输出放到适当的数据目录。

```bash
npm ci --ignore-scripts
npm test
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

The workflow in [.github/workflows/validate.yml](.github/workflows/validate.yml) runs the Node and Python regression suites. Live map verification is separate: a fixture passing does not establish that a provider's current page still returns the same geometry.

CI 执行 Node 和 Python 回归。在线地图验证需要单独记录；来源样例通过不等于当前网页仍会返回相同几何。

## Submit a change / 提交修改

1. Fork the repository and create a branch.
2. Keep the change focused; add a regression case when fixing parser, geometry, storage, or export behavior.
3. Update both README languages and both usage/output references when changing user-facing behavior.
4. Open a pull request explaining the problem, the resulting behavior, and how you checked it.

1. Fork 仓库并创建分支。
2. 保持改动聚焦；修改解析、几何、存储或导出行为时补充有意义的回归样例。
3. 用户行为变化时，同步更新中英文 README 及相关教程、结果说明。
4. 提交 PR，说明问题、修改后的表现和验证方式。

Do not commit collected databases, browser profiles, credentials, local dependencies, or caches. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the current licensing situation before reusing or adding third-party material.

不要提交采集数据库、浏览器配置、凭据、本地依赖或缓存。使用第三方内容前请核对 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 中的许可状况。
