# Incident Report: Main Branch Divergence & Recovery

**Date**: 2026-06-02 ~22:00 – 2026-06-03 00:21 (Asia/Shanghai)  
**Repository**: Kerry1020/search-mcp-worker  
**Severity**: High — core product logic overwritten, deployment versioning compromised

---

## 1. Summary

During a development session focused on engine stability, the agent made extensive modifications to `src/index.js` that diverged from the user's product vision ("web search as primary entry"). Critical vertical search logic (finalizeVerticalSearchResults pipeline, noise filtering, relevance scoring) was stripped and replaced with simplified alternatives. The main branch was restored from a backup repository taken from another machine.

## 2. Timeline

| Time | Event |
|------|-------|
| 22:00 | Session begins: code analysis + full testing of search-mcp-worker |
| 22:36 | v1.2 engine stability overhaul committed (A→B→C, intent routing, ecosystem locking) |
| 23:00 | ENGINE_STABILITY v1.2 docs, smoke_trace, provider sweep completed |
| 23:20 | Quality gate added (good/weak/bogus classification) |
| 23:28 | Intent routing refined (howto, short_ambiguous) |
| 23:46 | sina_news/163_news discovered missing — agent searched local machine, concluded "never existed" |
| 23:57 | User provides backup archive from another computer |
| 00:02 | sina/163 restored from archive but with simplified pipeline (finalizeVerticalSearchResults replaced with searchResult()) |
| 00:11 | sina/163 added to LEVEL_A general chain (violating web-first principle) |
| 00:18 | User decides to restore backup as main |
| 00:19 | `git reset --hard backup/main` + force push |
| 00:20 | CF Workers redeployed with backup version |
| 00:21 | Legacy branch created to preserve v1.2 work |

## 3. Root Cause

1. **Agent assumed current repo = ground truth** — didn't ask user about other machines/backups before concluding features "never existed"
2. **Simplified core logic without understanding its value** — finalizeVerticalSearchResults contains noise filtering, relevance scoring, and quality assessment that was replaced with a bare searchResult() call
3. **No branch protection on main** — all changes went directly to main without review gates

## 4. What Was Lost (in the reset)

The following commits are preserved in `legacy/agent-v1.2-20260602` but NOT in current main:

### Core Logic
- `5519533` feat: search_auto v2 engine stability overhaul (A→B→C, intent routing, ecosystem locking)
- `a855439` feat: result-level quality gate (good/weak/bogus)
- `843dca9` feat: howto + short_ambiguous intents, demote academic engines from general
- `ae689b4` fix: quality→quality_flag rename, bogus multi-signal detection
- `baca55c` fix: mercury intent classification

### Testing
- `ac382d0` test: smoke_trace regression script (22 assertions)
- `50c6dbd` test: provider sweep (34 providers)
- `a33fc34` fix: provider sweep v2 (serial, 12s timeout)
- `2e34ba9` test: 4 routing regression assertions + timeout/retry

### Documentation
- `52ccb2e` docs: ENGINE_STABILITY v1.2 authoritative design document
- `7222ead` docs: v1.2 fixes (tool names, alias naming, ecosystem lock)
- `795e0cb` docs: tool names scope
- `61e7717` docs: Appendix C — regression testing

### What Was Restored
- `db421bd` feat: restore search_sina_news + search_163_news (simplified, missing pipeline)
- `033a1d8` fix: sina/163 routing (removed from LEVEL_A, added to news/cjk_general)

## 5. What Current Main Has (backup version, commit `27ba39f`)

- Complete vertical search pipeline (finalizeVerticalSearchResults + 10+ dependency functions)
- Full noise filtering, relevance scoring, quality assessment
- All 55+ tools with proper schema registration
- sina_news / 163_news with full pipeline support
- searchSiteTargetVertical fallback mechanism

## 6. Diff Summary

```
Files changed: 8
Insertions: +2067
Deletions: -2024
Key file: src/index.js (2393 lines changed — near-complete rewrite in legacy)
New files: CODE_ANALYSIS.md, ENGINE_STABILITY.md, PROJECT_STATUS.md, tests/*, sweep_report.json
```

## 7. Evidence

| File | Description |
|------|-------------|
| `legacy/agent-v1.2-20260602` branch | All v1.2 commits preserved |
| `legacy/agent-v1.2-diverged-20260602` tag | Archive marker |
| `/Users/Kerry1020_k/Documents/归档.zip` | Original backup from another machine |

## 8. Prevention

| Action | Status | Priority |
|--------|--------|----------|
| /health endpoint with build SHA | Not done | P0 |
| main branch protection (no direct push) | Not done | P0 |
| CI must run smoke_trace before deploy | Not done | P0 |
| Agent must ask about backups/other machines before concluding features don't exist | Learned | Done |
| Never simplify core logic without understanding its full value | Learned | Done |

## 9. Next Steps

1. **Immediately**: Add /health SHA output + main branch protection
2. **Short term**: Cherry-pick v1.2 improvements back to current main (quality gate, intent routing, smoke tests) — but this time **on top of** the full vertical pipeline
3. **Medium term**: README rewrite, build pipeline cleanup
