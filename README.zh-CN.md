# search-mcp-worker

基于 Cloudflare Worker 的 MCP 服务器，提供多引擎网页搜索、GitHub 查询、URL 抓取和 Wikipedia 查询——无需 API Key。

## MCP 工具

### 网页搜索

| 工具 | 说明 |
|------|------|
| `search_auto` | 多引擎自动回退搜索，返回第一个有效结果。 |
| `search_duckduckgo` | DuckDuckGo HTML 搜索，通用回退。 |
| `search_bing` | Bing 搜索。 |
| `search_yahoo` | Yahoo 搜索。 |
| `search_google_web` | Google 搜索（可能限速）。 |
| `search_baidu` | 百度中文搜索。 |
| `search_yandex` | Yandex 搜索，额外回退。 |
| `search_wikipedia` | Wikipedia 搜索并返回摘要。 |

### GitHub

| 工具 | 说明 |
|------|------|
| `search_github_repos` | 搜索公开 GitHub 仓库。 |
| `fetch_github_file` | 按 owner/repo/path/ref 获取公开文件。 |

### URL 与元数据

| 工具 | 说明 |
|------|------|
| `fetch_metadata` | 获取 URL 的标题、描述、状态码等元数据。 |
| `fetch_url` | 获取 URL 并返回可读文本和元数据。 |

## 本地开发

```bash
npm install
npx wrangler dev --local --port 8791
```

## 部署

```bash
npx wrangler deploy
```

## 项目结构

```
search-mcp-worker/
├── src/index.js
├── wrangler.toml
├── package.json
└── README.md
```
