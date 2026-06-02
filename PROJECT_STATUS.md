# search-mcp-worker 项目全貌与瓶颈分析

**分析时间**: 2026-06-02 20:21 Asia/Shanghai  
**版本**: v0.7.4  
**仓库**: Kerry1020/search-mcp-worker  
**部署**: search-mcp.qdp.qzz.io (Cloudflare Workers)

---

## 一、项目全貌

### 定位
一个部署在 Cloudflare Workers 上的 MCP (JSON-RPC 2.0) 搜索聚合服务。给 AI 客户端（AIaW、Claude 等）提供一个统一的搜索 endpoint，背后聚合 55 个搜索引擎和工具。

### 技术栈
- **运行时**: Cloudflare Workers (V8 isolate)
- **协议**: MCP over HTTP POST `/mcp` (JSON-RPC 2.0)
- **语言**: JavaScript (ES Module)，单文件 bundle 2719 行
- **构建**: 无构建步骤，`src/index.js` 直接部署
- **CI/CD**: GitHub Actions → `wrangler deploy`（push to main 自动部署）
- **域名**: search-mcp.qdp.qzz.io (Cloudflare Route)

### 文件结构
```
search-mcp-worker/
├── src/
│   ├── index.js              # 主 bundle，2719 行，包含全部逻辑
│   ├── core/
│   │   ├── provider-config.js    # Provider 配置解析（resolveProviderConfig）
│   │   ├── provider-defaults.js  # 8 个默认 Provider 配置
│   │   └── request-context.js    # 请求上下文封装
│   └── mcp/
│       ├── protocol.js           # JSON-RPC 协议处理
│       └── tool-schemas.js       # Tool schema 工厂函数
├── __tests__/                # 6 个测试文件（未跑过 CI）
├── .github/workflows/deploy.yml  # 自动部署
├── wrangler.toml             # Workers 配置
├── CODE_ANALYSIS.md          # 代码全量分析（本次新增）
├── README.md / README.zh-CN.md
└── package.json
```

### 55 个 Tool 概览

| 类别 | 数量 | Tool 名称 |
|---|---|---|
| 通用搜索 | 10 | auto, duckduckgo, bing, yahoo, google_web, baidu, yandex, naver, sogou, archive |
| 学术 | 4 | arxiv, pubmed, paperswithcode, crossref |
| 开发者 | 6 | hackernews, stackoverflow, npm, devto, crates, pypi |
| 社交/媒体 | 6 | reddit, mastodon, peertube, bbc, bing_news, lemmy |
| 知识/参考 | 6 | wikipedia, wikidata, wiktionary, openlibrary, musicbrainz, osm |
| 金融/其他 | 3 | sec_edgar, instant_answer, find_rss |
| GitHub | 2 | search_github_repos, fetch_github_file |
| 抓取工具 | 3 | fetch_url, fetch_metadata, debug_capture_search_html |
| API 搜索 | 3 | ollama, parallel, xiaohongshu |
| Provider 管理 | 12 | list, get_config, set_config, set_{brave,tavily,jina,searxng,serpapi,bing,parallel,ollama,xiaohongshu} |

### 数据源协议分布

| 协议 | 数量 | 引擎 |
|---|---|---|
| **HTML 抓取** | 13 | duckduckgo, bing, yahoo, google, baidu, yandex, naver, sogou, archive, ecosia(已删), qwant(已删), pypi, bing_news |
| **JSON API** | 22 | arxiv(Atom), pubmed, paperswithcode, crossref, hackernews, stackoverflow, npm, devto, reddit, mastodon, peertube, bbc, lemmy, wikidata, wiktionary, openlibrary, musicbrainz, osm, sec_edgar, github, brave, duckduckgo instant |
| **付费 API** | 3 | ollama, parallel, xiaohongshu (token server) |
| **自有抓取** | 3 | fetch_url, fetch_metadata, fetch_github_file |

---

## 二、实测结果（2026-06-02）

### 全量实测 82 个用例结果

| 状态 | 数量 | 占比 |
|---|---|---|
| ✅ 正常 | ~69 | 84% |
| ❌ captcha 拦截 | ~11 | 13% |
| ❌ 数据问题 | ~2 | 3% |

### 被拦截的引擎（captcha / consent page）

| 引擎 | 测试关键词 | 结果 |
|---|---|---|
| search_duckduckgo | JS async / 量子计算 | captcha_or_verification |
| search_google_web | FastAPI / 碳中和 | captcha_or_verification |
| search_yandex | Tolstoy / 莫斯科天气 | captcha_or_verification |
| search_bing | 部分关键词 | captcha_or_verification (偶发) |
| search_baidu | 高考作文 | captcha_or_verification |
| search_yahoo | laptop 2026 | consent_page |
| search_pypi | numpy pandas | challenge page |

### 完全正常的引擎（49 个 tool）

所有 JSON API 类引擎 + sogou + naver + archive + bing(大部分) + baidu(大部分) + Yahoo(大部分)

---

## 三、核心瓶颈

### 瓶颈 1：CF Workers 共享 IP 被搜索引擎标记（P0）

**根因**: Cloudflare Workers 免费版使用共享 IP 池，Google/Bing/DuckDuckGo/Yandex/Baidu 已将这些 IP 段标记为"自动化流量"。无论 UA/Header 怎么改，captcha 拦截发生在 IP 层和 TLS 指纹层，HTTP header 伪装完全无效。

**实测证据**: 
- 改前（旧 UA）Bing 能用 → 改后（完整 Sec-CH-UA + Referer）Bing 反而挂了
- 回滚回旧 UA 后 Bing 恢复
- 说明 Header 复杂化反而增加了被检测的风险

**影响范围**: 13 个 HTML 抓取引擎中约 6-8 个受影响（取决于关键词和时段）

**可选方案**:
| 方案 | 效果 | 成本 |
|---|---|---|
| 维持现状 | 49/55 tool 可用 | $0 |
| Brave Search API | 替代 Google | $5/月 |
| Workers Paid + dedicated IP | 可能改善 | $5/月 |
| 住宅代理 | 大幅改善 | 按流量计费 |

### 瓶颈 2：单文件 2719 行 bundle，无源码构建流程（P1）

**现状**: `src/index.js` 是一个 esbuild 预编译的 bundle（带 `__defProp`, `__name` 等产物标记），不是手写源码。`src/core/` 和 `src/mcp/` 下有模块化拆分，但**线上部署的是 bundle 而非模块**。

**问题**:
- 在 bundle 上做修改极其困难（变量名被混淆、函数被 `__name` 包裹）
- 模块化文件和 bundle 之间没有构建步骤同步
- 本地改了 `src/index.js`（bundle）后与远程 merge 冲突

### 瓶颈 3：README 与线上代码不同步（P2）

**README 声称有但线上不存在**:
- `search_bing_cn` / `search_bing_global` / `search_sina_news` — README 里写了但代码已删除

**线上存在但 README 未列出**:
- 12 个 provider 管理工具 (provider_list/get_config/set_*)
- `search_ollama` / `search_parallel` / `search_xiaohongshu`

README 写的 "42 public tools"，实际线上 55 个。差了 13 个。

### 瓶颈 4：小红书 Native API 依赖外部 Token Server（P2）

**现状**: `search_xiaohongshu` 有双路径——native API（走 token server 签名）和 site-targeted fallback。

**风险**:
- Token Server 地址硬编码为 `https://31.97.132.244:8443`，这是个外部 IP，不是你自己控制的
- Auth key 硬编码为 `dev-key-123`
- 如果 token server 挂了或 IP 变了，native API 路径直接失败（虽然有 fallback）

### 瓶颈 5：无 CI 测试（P3）

**现状**: 有 6 个测试文件但从未在 CI 中运行。GitHub Actions 只做 deploy。

**风险**: 改一行代码可能悄悄搞挂某个引擎的 HTML parser，线上才知道。

### 瓶颈 6：HTML Parser 脆弱（P3）

**现状**: 13 个引擎用正则表达式解析 HTML 提取搜索结果（`extractBingResults`, `extractYahooResults`, `extractYandexResults` 等）。

**风险**: 搜索引擎随时改版 DOM 结构，parser 立刻失效。这是所有 HTML 爬虫的固有风险，无解。

---

## 四、架构优势（不该被忽视的）

1. **MCP 统一入口**: 一个 `/mcp` 端点暴露 55 个 tool，AI 客户端无需管理多个 API
2. **Provider 无状态注入**: API key 通过 HTTP header 传入，Worker 本身不存任何密钥
3. **search_auto 智能聚合**: 16 引擎 fallback 链 + 内存缓存，自动跳过失败的引擎
4. **垂直覆盖广**: 学术/开发者/社交/金融/知识/地理/音乐——这些 API 类引擎完全不受 IP 限制
5. **零运维**: CF Workers 免费版，无数据库，无状态，自动扩展
6. **小红书双路径**: native API + site-targeted fallback，比纯 site: 搜索质量高很多

---

## 五、代码质量问题

| 问题 | 位置 | 严重度 |
|---|---|---|
| bundle 和模块化源码不同步 | `src/index.js` vs `src/core/*` `src/mcp/*` | 高 |
| `env` 变量未定义但被引用（`env?.XHS_COOKIES`） | `searchXiaohongshu` 函数内 | 中 |
| 重复的 arxiv 分支（`else if ("arxiv")` 出现两次） | `searchAuto` 的 engine dispatch | 低 |
| UA 池版本过旧（Chrome 119-122，当前 stable 137） | `GSA_USER_AGENTS` | 低 |
| wrangler.toml 的 `main` 指向 `src/index.js` 但那是 bundle 不是模块入口 | `wrangler.toml` | 中 |

---

## 六、建议优先级

| 优先级 | 行动 | 工作量 |
|---|---|---|
| P0 | README 与线上 tool 同步 | 1h |
| P1 | 建立源码→bundle 构建流程 | 2-3h |
| P1 | 将测试加入 CI | 1h |
| P2 | 清理 bundle 中的死代码和 bug（重复 arxiv、env 引用） | 2h |
| P3 | 接 Brave API 替代被封的 HTML 引擎（可选） | 2h |
| P3 | Token Server 可配置化（不硬编码 IP） | 30min |
