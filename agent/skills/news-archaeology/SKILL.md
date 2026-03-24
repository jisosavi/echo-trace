---
name: news-archaeology
description: Scrape and normalize current articles from TASS, Xinhua, and SPA using Puppeteer with stealth settings. Use when gathering authoritarian media text, extracting quotes, or refreshing source captures.
---

# News Archaeology

## Purpose
Collect article text and metadata from TASS, Xinhua, and SPA in a repeatable, low-noise pipeline.

## Workflow
1. Launch Puppeteer with stealth plugin and conservative delays.
2. Visit source front pages and candidate article URLs.
3. Extract title, publication time, body text, language, and URL.
4. Write normalized records to `agent/data/raw-news.json`.

## Implementation Notes
- Use `puppeteer-extra` + `puppeteer-extra-plugin-stealth`.
- Keep request pacing human-like (randomized waits, max concurrent pages <= 2).
- Save retrieval timestamp (`retrieved_at`) for each record.

## Starter Command
```bash
node scripts/scrape-news.mjs
```

## Output Schema
```json
{
  "source": "TASS",
  "url": "https://...",
  "title": "...",
  "published_at": "...",
  "retrieved_at": "...",
  "language": "en",
  "body": "..."
}
```
