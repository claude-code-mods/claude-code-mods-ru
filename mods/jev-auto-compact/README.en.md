# jev-auto-compact

> This English reference text was assembled from the upstream plugin manifest and catalogue metadata; the pinned upstream commit did not ship a README.

At 60% context, prunes stale tool calls with zero generation; skips instead of falling back to an LLM summary.

Jev-powered verbatim compaction: once context reaches 60%, prunes stale tool calls with zero generation. Skips (never falls back to the LLM summarizer) when nothing is prunable; records evidence for learning.db.

## Install

```
/plugin install jev-auto-compact --marketplace claude-code-mods/claude-code-mods-ru
```

## Source and license

- Original author: notque
- Original repository: https://github.com/notque/vexjoy-agent
- License: MIT
