# 2026-05-26 OpenLibrary fallback-source qualification and integration design

## Context
`search_openlibrary` currently depends on `https://openlibrary.org/search.json`, but real production requests using the worker's product-style `User-Agent` receive `403 Forbidden` from OpenLibrary. The existing HTML fallback (`/search?q=...`) is not a reliable replacement: it can return deprecated-endpoint errors for non-browser request shapes and can rank noisy `SiCp` collisions above the real `SICP` work.

The user wants a stronger book/work search path that:
- requires no user-specific API key
- uses directly fetchable upstreams
- prefers sources that are not easily blocked
- tests all candidate sources against real upstream behavior before deciding whether to keep or discard them

## Goal
Keep the `search_openlibrary` tool surface unchanged while turning its internals into a qualified multi-source book/work search pipeline.

The tool must:
1. preserve honest no-match behavior
2. distinguish upstream blocking/degraded behavior from genuine no-match
3. only integrate fallback sources that pass real upstream qualification
4. avoid over-filtering; prefer ranking over aggressive exclusion

## Non-goals
- Adding new user-visible MCP tools for each fallback source
- Requiring any user API key or per-user credential
- Treating unverified candidate sources as production-ready
- Refactoring unrelated search tools

## Candidate source pool to qualify
These sources must all be tested before keep/drop decisions:

### Primary source
1. OpenLibrary JSON (`/search.json`) with an alternate request shape that avoids the current worker UA block

### Pure book / catalog candidates
2. Internet Archive
3. HathiTrust
4. Project Gutenberg

### General-purpose fallback candidates
5. Wikipedia
6. DuckDuckGo book-targeted fallback
7. Bing-family book-targeted fallback

## Qualification-first workflow
No fallback source is added to the live chain until it passes real-source qualification.

### Phase 1: upstream qualification
For each candidate source, verify two things.

#### A. Reachability and anti-block behavior
Check whether the source:
- works without any user API key
- returns usable results from the current environment
- does not immediately challenge/block the worker request shape
- can be reached with a stable, source-appropriate request profile

#### B. Query quality behavior
Run the same representative query set across every source:
- `SICP`
- `The Mythical Man-Month`
- `Claude Code`
- `ios 27`

Qualification expectations:
- `SICP` must return an obviously correct work-level result
- `The Mythical Man-Month` should return a real work/book result, not generic topic noise
- `Claude Code` must not spray token-collision junk if the source has no meaningful book result
- `ios 27` should either produce a tightly controlled result or an honest no-match

### Phase 2: source grading
Each source gets one of three grades:

- **Grade A** — stable and useful; eligible for normal fallback chain placement
- **Grade B** — occasionally useful but noisier or less stable; only eligible for deep fallback placement
- **Grade C** — blocked, too noisy, or structurally unsuitable; excluded from implementation

Only Grade A and Grade B sources may be integrated.

## Integration design
After qualification, `search_openlibrary` becomes a book/work meta-search path behind the same MCP tool name.

### Proposed chain order
The live order is determined by qualification results, but the intended priority is:
1. OpenLibrary JSON (fixed request shape)
2. Grade A pure book/catalog sources
3. Grade B pure book/catalog sources
4. Grade A general-purpose fallbacks
5. Grade B general-purpose fallbacks
6. Honest degraded / blocked / no-match response

This ordering preserves semantic purity first, then broadens to robust public fallback paths.

## Internal structure
The current `searchOpenLibrary(...)` function should stop embedding all source logic directly.

Add the following narrow internal boundaries:
- `searchOpenLibraryPrimary(query, limit)`
- `searchOpenLibraryQualifiedFallbacks(query, limit)`
- `search<SourceName>ForBooks(query, limit)` for each integrated source
- `normalizeBookishResult(raw, source)`
- `rankBookishFallbackResults(query, limit, results)`
- `classifyBookishSearchOutcome(...)`

These helpers keep source-specific parsing isolated and let the main tool orchestrate source order and error semantics.

## Result normalization
Every qualified source must normalize into the existing result shape:
- `title`
- `url`
- `snippet`

Internal metadata may be added for ranking only:
- `upstream_source`
- `result_kind` (`book`, `work`, `edition`, `topic`, `article`, `other`)
- `source_grade`
- `source_priority`
- `confidence`

This metadata must not force a new user-visible output contract.

## Ranking policy
Keep the existing project rule: less filtering, more ranking.

Ranking signals, in priority order:
1. exact phrase title match
2. whole-token acronym match
3. full multi-token coverage
4. book/work/edition kind over topic/article kind
5. source priority
6. confidence / source-grade tie-breakers

Only filter obviously bad candidates:
- empty titles
- obvious navigation pages
- obvious non-content pages
- malformed URLs
- pure search-engine junk that is not a book/work page

## Deduplication
Two levels are required.

### Per-source canonicalization
Normalize each source’s obvious tracking/query noise away.

### Cross-source weak dedupe
When two results are near-identical on normalized title and represent the same work, keep the stronger source according to:
- better semantic kind
- higher source priority
- stronger title/query match

Avoid over-deduping different editions unless they are clearly the same work-level target.

## Error semantics
The tool should stop collapsing all failures into generic no-match.

Possible internal outcomes:
- `ok`
- `degraded_but_ok`
- `upstream_blocked`
- `no_match`
- `all_upstreams_failed`

User-visible behavior should remain simple, but structured content should preserve enough metadata to distinguish:
- true no-match
- primary blocked but fallback succeeded
- all qualified sources failed

## Testing plan
### Qualification tests
Add source-qualification cases that document whether each candidate source is accepted or rejected based on real behavior.

### Unit/integration regression tests
For every integrated source:
- happy path
- no-match / noisy-result path
- blocked/degraded path if applicable

### Aggregation tests
Preserve and extend these behaviors:
- `SICP` returns the real work over `SiCp` collisions
- `ios 27` remains an honest no-match
- split-token junk like `Claude Code` does not become fake book matches
- degraded primary + working fallback returns useful results with degradation metadata
- cross-source duplicate works collapse correctly

### Live verification
Before declaring the work complete:
- re-run real upstream probes for each retained source
- verify the deployed MCP surface returns live results through the actual route
- explicitly record which candidate sources were retained vs discarded

## Implementation sequence
1. Add qualification harness/probes for all candidate sources
2. Record keep/drop decisions based on real-source evidence
3. Fix OpenLibrary primary request shape
4. Integrate Grade A fallback sources
5. Integrate Grade B fallback sources only if they improve real recall without swamping relevance
6. Add aggregation/ranking/degradation tests
7. Verify locally, then through deployed MCP

## Acceptance criteria
This design is complete when:
- every candidate source has been real-source tested
- every retained source is keyless and directly fetchable
- every discarded source is discarded because of evidence, not assumption
- `search_openlibrary` produces honest, useful results through the live MCP surface
- blocked primary behavior is distinguishable from true no-match
