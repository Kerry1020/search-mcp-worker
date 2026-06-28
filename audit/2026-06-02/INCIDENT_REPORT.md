下面是一份**可直接交接给他人**的《项目实现现状 + 最终目标 + 后续改进路线图》汇总（偏“工程交接文档”风格）。我会把**你现在的真实基线**（主线已恢复为备份版本、legacy保留 v1.2 改动、/health 加了 SHA+时间戳、审计证据齐全）和**系统的关键实现点**、**风险点**、**下一步推进顺序与验收标准**全部写清楚。文中涉及的历史事实与证据来源，均来自你提供的审计包与项目状态分析。 [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt), [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md), [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)

***

# 0. 一句话交接摘要（给“接手人”看的）

这是一个部署在 **Cloudflare Workers** 上的 **MCP(JSON‑RPC 2.0) 搜索聚合服务**，对外暴露 `/mcp` 与 `/health`；核心目标是\*\*“网页搜索引擎为主入口（web‑first），其它垂直/结构化源为补充增强”\*\*。项目曾发生主线偏航与回滚事故，现已恢复备份主线并保留 legacy 分支保存 v1.2 治理资产；已补齐 `/health` 的 build SHA 与时间戳作为线上真相。 [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md), [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)

***

# 1. 项目定位与最终目标（Product Vision）

## 1.1 最终目标（必须写死，防再次偏航）

* **默认入口：网页搜索引擎（Search engines）**  
  Bing/Yahoo/Sogou/Naver/Archive 等 HTML 搜索引擎作为“主入口”。 [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md)
* **补充增强：垂直/结构化源（Vertical/Structured sources）**  
  学术（arxiv/pubmed/crossref/paperswithcode）、开发者（github/stackoverflow/hn）、知识库（wikipedia/wikidata）、社交（reddit/lemmy/mastodon）、新闻垂直（bing\_news、sina/163）等只在需要时补位或按意图增强。 [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md), [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)
* **核心体验约束**：  
  不能为了“稳定”把产品改成“结构化源抢第一棒”；稳定性的实现必须服务 web-first。 [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)

## 1.2 不可改变的工程底线（从事故中抽象出来）

* **`finalizeVerticalSearchResults` 垂直管线不可被简化替代**：它承载降噪、过滤、权重排序、质量评估等核心价值，曾被替换为简单 `searchResult()` 导致核心价值丢失，属于高危操作。 [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)
* **任何“结论：功能不存在”必须先确认是否存在其它机器/备份**：事故根因之一即“假设当前repo=真相”。 [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)

***

# 2. 当前实现总览（Architecture / Code）

## 2.1 运行与部署

* **运行时**：Cloudflare Workers (V8 isolate) [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md)
* **协议**：MCP over HTTP POST `/mcp`，JSON‑RPC 2.0 [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md)
* **代码形态**：单文件 bundle（`src/index.js`）直接部署；仓库里虽有模块目录，但线上跑的是 bundle，存在“bundle/模块不同步”风险（历史问题）。 [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md)
* **/health**：现已包含 `build.sha` + `build.time`（你已上线，用于版本真相；审计中将“/health 加 SHA”列为P0）。 [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)

## 2.2 工具与数据源类型（55+ tools 级别）

项目工具覆盖面很广，按来源协议可分：

* **HTML 抓取类**：bing/yahoo/google/baidu/yandex/naver/sogou/archive/pypi/bing\_news 等，易受 captcha/consent/challenge 影响 [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md)
* **JSON/Atom API 类**：arxiv/pubmed/crossref/hn/so/npm/reddit/wikidata 等，稳定性更高 [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md)
* **付费/外部 API**：ollama/parallel/xiaohongshu（存在 token server 风险点） [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md)

> **关键现实约束**：在 CF Workers 共享 IP 下，部分 HTML 引擎会结构性触发验证码/同意页，header/UA 伪装通常无解，只能做识别与治理。 [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md)

## 2.3 新闻垂直能力（你“呕心沥血”的部分）

* `search_sina_news` + `search_163_news` 属于“站内新闻搜索/垂直引擎”。
* 价值不在“能返回链接”，而在：关键词过滤、降噪、去壳/去跳转、结果类型分类、权重排序与质量评估（由 `finalizeVerticalSearchResults` 及其依赖闭包支撑）。 [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)
* 事故中曾出现“缺依赖→简化→价值丢失”，因此交接要求：**垂直管线闭包必须整体存在且不得替换**。 [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)

***

# 3. 事故与恢复（必须交接，否则接手人会再次踩坑）

## 3.1 事故摘要（Main Divergence & Recovery）

* 在一次以“稳定性”为目标的 session 中，agent 对 `src/index.js` 做了大量修改，偏离产品愿景（web-first），并简化/替换核心垂直管线；随后你从另一台电脑取回备份并决定以备份为主线，legacy 分支保存 v1.2 工作。 [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)

## 3.2 重要保全点（现在仓库中存在的证据）

* `legacy/agent-v1.2-20260602`：保存所有 v1.2 改动（search\_auto v2、quality gate、howto/short\_ambiguous、smoke\_trace、provider sweep、ENGINE\_STABILITY v1.2 等）。 [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)
* 审计文件（Incident report、diff、commit logs、patch）已生成并在 repo 中可追溯。 [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)

> **交接警告**：legacy 分支不是“可以直接覆盖 main 的新主线”，它是“候选治理资产池”。任何回收必须遵守 web-first 与垂直管线不可替换红线。 [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)

***

# 4. 当前“实现能力清单”（按接手人视角）

## 4.1 已具备

* web 搜索引擎工具（bing/yahoo/sogou/naver/archive 等） [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md)
* 垂直/结构化源（学术/开发者/知识库/社交/金融/地理/音乐） [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md)
* 新闻垂直：bing\_news + sina/163（备份主线含完整垂直管线） [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)
* /health 版本真相（build.sha/build.time）已上线（你刚完成，审计曾要求） [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)

## 4.2 需要持续关注的高风险区域

* **HTML parser 脆弱**：DOM/页面结构变动会导致解析器失效，这是固有风险。 [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md)
* **CF Workers 共享 IP 的验证码/同意页**：部分引擎不稳定是结构性问题，不能承诺永远可用。 [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md)
* **bundle vs 模块目录不同步**：仓库存在“看起来有源码但线上跑 bundle”的风险，容易造成“改了没生效/以为最新其实不是”。 [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md)
* **小红书 token server 风险**：外部硬编码 server 与 key（历史风险点）。 [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md)

***

# 5. 后续改进路线图（你要交接“怎么接、怎么优化、按什么顺序”）

下面是**推荐推进顺序**（每一项都有验收标准），接手人照着走不会偏航：

## P0（必须长期保持，防复发）

1. **版本真相**：/health 必须持续输出 build.sha + build.time（已完成，但后续改动不得破坏） [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)
2. **main 分支保护 + PR review 门禁**（你说已开启；交接要求：不可关闭） [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)
3. **回归测试门禁**：smoke\_trace 必须 100% 可用于门禁（现在你说 9/10，接手人需要把剩余 1 条处理为稳定通过或明确降级为 warn check；否则门禁不确定会被绕开）。 [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)

**验收**：任何合并必须可复现通过 smoke；线上 SHA 与仓库 commit 对齐。 [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)

## P1（安全回收 legacy 的治理资产——只“吸收”，不“推翻”）

目标：把 v1.2 的好东西搬回 main，但不改变产品愿景与不动垂直管线。 [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)

推荐回收顺序：

1. **测试/工具链资产**：provider sweep、smoke\_trace 的完善版、回归文档等（低风险高收益） [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)
2. **文档契约**：ENGINE\_STABILITY v1.2（作为“为什么这么做”的权威说明） [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)
3. **质量闸门（quality gate）**：只做兜底识别假返回/弱返回，绝不替代 `finalizeVerticalSearchResults` 的过滤/排序/质量评估 [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)
4. **意图路由增益**：howto/short\_ambiguous 等只能用于“调整 web 引擎顺序与补充源触发”，不得变成结构化抢第一棒（事故教训）。 [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)

**验收**：

* `finalizeVerticalSearchResults` 闭包完整且未被简化替换；
* 默认链仍为 web-first；
* 迁回内容必须有回归断言覆盖。 [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)

## P2（结构治理：解决“以为本地最新”）

二选一（必须做决策，否则这个坑会反复炸）： [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md)

* **短期止血**：明确唯一部署入口文件（例如只认 `src/index.js`），清理/冻结误导性的“结构化源码目录”，避免改错文件。 [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md)
* **长期正确**：建立源码→bundle 构建流程，让模块源码成为真源，CI 构建产出再部署。 [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md)

**验收**：不存在“改了不会上线”的路径；PR 评审可以明确知道改动会不会部署。 [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md)

***

# 6. 接手人“最容易搞错的三件事”（强提醒）

1. **把 legacy 直接覆盖 main**：会再次推翻 web-first 或简化核心垂直管线（事故重演）。 [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)
2. **简化/替换 `finalizeVerticalSearchResults`**：等于砍掉你新闻垂直的核心价值（关键词过滤/降噪/权重排序）。 [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)
3. **只看时间戳不看 SHA**：会再次出现“部署了旧代码但以为是最新”的错觉；必须以 `build.sha` 为准。 [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt)

***

# 7. 交接附录（建议你直接附给对方）

你已经有审计包 [INCIDENT\_AUDIT\_BUNDLE.txt](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt?EntityRepresentationId=c27ecac1-d7f7-4244-b12b-acd3031116e0)，它包含：时间线、root cause、丢失清单、diff 统计、legacy/main commits 列表、patch 片段等，是最强的交接证据。  
同时项目状态分析文档也记录了架构、工具分布、HTML 风险与 CI 缺失等背景信息，适合给接手人快速理解全貌。 [\[INCIDENT_A...DIT_BUNDLE \| Txt\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/INCIDENT_AUDIT_BUNDLE.txt) [\[365abdn-my...epoint.com\]](https://365abdn-my.sharepoint.com/personal/u02lk26_abdn_ac_uk/Documents/Microsoft%20Copilot%20Chat%20%E6%96%87%E4%BB%B6/ENGINE_STABILITY.md)

***

## 你可以直接复制给接手人的“交接声明”模板

> **主线真相**：main 当前为备份版本（web-first + 完整垂直管线），线上以 `/health.build.sha` 为真相。  
> **安全红线**：不得简化/替换 `finalizeVerticalSearchResults` 闭包；不得把垂直新闻工具塞入通用链改变默认入口；legacy 仅作为候选治理资产池。  
> **后续路线**：P0 门禁（/health sha+time、PR保护、smoke稳定）→ P1 回收测试/文档/兜底质量闸门（不动核心管线）→ P2 结构治理（解决 bundle/源码不同步）。

***

### 只问你一个必要的补充（为了把交接文档“落到具体命令/入口”）

接手人部署 Cloudflare Workers 的方式是 **wrangler 本地部署** 还是 **CF Dashboard 手工发布**？  
我只要你回答“wrangler / dashboard”，我就能把交接文档里“部署与验真流程（用 /health sha/time 对齐）”那一段补成更具体的一页操作 SOP。
