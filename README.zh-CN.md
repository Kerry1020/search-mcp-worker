# search-mcp-worker

基于 Cloudflare Worker 的 MCP 服务器，提供多引擎网页搜索、学术论文、开发者论坛、社交媒体、新闻等——无需 API Key。

## MCP 工具

### 网页搜索

| 工具 | 说明 |
|------|------|
| `search_auto` | 多引擎自动回退搜索。 |
| `search_duckduckgo` | DuckDuckGo 搜索，支持地区代码。 |
| `search_bing` | Bing 搜索。 |
| `search_yahoo` | Yahoo 搜索。 |
| `search_google_web` | Google 搜索（可能限速）。 |
| `search_baidu` | 百度中文搜索。 |
| `search_sogou` | 搜狗中文搜索。 |
| `search_naver` | Naver 韩语搜索。 |
| `search_yandex` | Yandex 搜索。 |
| `search_wikipedia` | Wikipedia 搜索。 |

### 学术搜索

| 工具 | 说明 |
|------|------|
| `search_arxiv` | arXiv 预印本搜索。 |
| `search_pubmed` | PubMed 生物医学文献搜索。 |

### 开发者 & 代码

| 工具 | 说明 |
|------|------|
| `search_hackernews` | Hacker News 技术讨论搜索。 |
| `search_stackoverflow` | Stack Exchange 全站搜索（支持所有子站）。 |
| `search_npm` | npm 包搜索。 |
| `search_devto` | Dev.to 开发者博客搜索。 |
| `search_github_repos` | GitHub 仓库搜索。 |
| `fetch_github_file` | 获取 GitHub 公开文件。 |

### 社交 & 视频

| 工具 | 说明 |
|------|------|
| `search_reddit` | Reddit 帖子搜索，支持按 subreddit 过滤。 |
| `search_mastodon` | Mastodon/fediverse 搜索，支持任意实例。 |
| `search_peertube` | PeerTube 视频搜索。 |

### 新闻 & 媒体

| 工具 | 说明 |
|------|------|
| `search_bbc` | BBC 新闻搜索。 |
| `search_bing_news` | Bing 新闻搜索。 |
| `search_archive` | Internet Archive 搜索 + Wayback Machine。 |

### URL & 元数据

| 工具 | 说明 |
|------|------|
| `fetch_metadata` | 获取 URL 标题、描述、状态码等。 |
| `fetch_url` | 获取 URL 可读文本。 |

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
