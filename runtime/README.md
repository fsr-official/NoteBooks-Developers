# Static reader runtime

`chapter-reader.js` exports `attachChapterReader(article, { desmosApiKey })`. It accepts `data-kind="page|chapter"` fragments from renderer version `0.2.x` and returns a cleanup function. The fragment itself contains no executable scripts.

The stylesheet exposes host-theme overrides through `--reader-page`, `--reader-surface`, `--reader-text`, `--reader-muted`, `--reader-border`, `--reader-accent`, `--reader-soft`, `--reader-shadow`, `--reader-font-body`, `--reader-font-mono`, `--reader-font-xs`, `--reader-font-sm`, `--reader-font-base`, `--reader-font-lg`, `--reader-space-1` through `--reader-space-6`, and `--reader-radius-sm|md|lg`. `data-mode="dark"` selects the built-in dark defaults.

TikZ SVGs use the repository's existing `/bin/tikzjax/output/fonts.css` asset. Desmos loads only after a reader clicks a graph; the host application supplies its API key at runtime.
