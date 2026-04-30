# Web Pattern Analyzer

> CO-OP Industry Project — Module 2 | Chitkara University, Punjab
> Supervised by **Dr. Lalit Sharma**, Department of Computer Science & Engineering

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org)
[![Deployed on Render](https://img.shields.io/badge/Backend-Render-46E3B7.svg)](https://render.com)
[![Frontend on Vercel](https://img.shields.io/badge/Frontend-Vercel-black.svg)](https://vercel.com)




---

## Project Title

**Automated UX Design Pattern Extraction from Live Websites Using a Headless Browser Pipeline**

---

## Abstract

Web Pattern Analyzer is a full-stack research tool that crawls any live URL using a headless Chromium browser and extracts structured design intelligence in real time — covering color palettes, typography, accessibility compliance, visual hierarchy, and layout patterns — without any manual inspection or external ML services.

---

## Live Demo

| Service | URL | Status |
|---|---|---|
| Frontend | https://webpatternanalyzer.vercel.app | ✅ Live |
| Backend API | https://webstyle-analyzer.onrender.com | ✅ Live |
| Health check | https://webstyle-analyzer.onrender.com/health | ✅ Live |

> **Note:** The backend runs on Render's free tier and may take 30–60 seconds to respond on the first request after inactivity (cold start). Subsequent requests are fast.

---

## Current Status

| Feature | Status |
|---|---|
| Headless browser extraction | ✅ Complete |
| Color palette (k-means) | ✅ Complete |
| Semantic theme extraction | ✅ Complete |
| Typography scale detection | ✅ Complete |
| WCAG accessibility analysis | ✅ Complete |
| Visual hierarchy scoring | ✅ Complete |
| CSS framework fingerprinting | ✅ Complete |
| Layout pattern detection | ✅ Complete |
| React frontend with 6 panels | ✅ Complete |
| Deployed on Render + Vercel | ✅ Complete |
| Memory optimization (512MB limit) | ✅ Complete |
| Resource interception (images/fonts) | ✅ Complete |
| Docker support | ✅ Complete |
| Dark mode detection | 🔄 In progress |
| Batch URL analysis | 📋 Planned |
| ML design quality scoring | 📋 Planned |

---

## What It Does

Web Pattern Analyzer crawls any live URL with a headless Puppeteer browser and extracts structured design intelligence across 8 dimensions:

| Dimension | Method | Output |
|---|---|---|
| Color palette | K-means RGB clustering on computed DOM styles | 5–8 dominant colors |
| Semantic theme | Per-zone style extraction (nav, header, footer, buttons) | Color + font per zone |
| Visual hierarchy | Size × position × font-size scoring | Top 20 ranked elements |
| Brand colors | Logo image parent background detection | High-importance color signals |
| CSS framework | Class selector fingerprinting | Bootstrap / Tailwind / Bulma |
| Typography scale | Modular ratio fitting on heading font sizes | Scale ratio + base size |
| Accessibility | WCAG 2.1 AA contrast ratio (≥ 4.5:1) | Passing color pairs |
| Layout patterns | Grid + flex computed property analysis | Column templates, gap, direction |

---

## Tech Stack

### Backend
| Technology | Purpose |
|---|---|
| Node.js 20.x | Runtime |
| TypeScript 5.x | Language |
| Express.js | REST API server |
| Puppeteer 24.x | Headless Chrome automation |
| Winston | Structured logging |
| dotenv | Environment configuration |

### Frontend
| Technology | Purpose |
|---|---|
| React 18 | UI framework |
| Vite | Build tool |
| TypeScript | Language |

### Infrastructure
| Service | Purpose |
|---|---|
| Render | Backend hosting (free tier, 512MB RAM) |
| Vercel | Frontend hosting |
| GitHub | Source control |

---

## Project Structure

```
webstyle-research-paper/
├── SourceCode/                   # Backend
│   ├── src/
│   │   ├── server.ts             # Express app entry, eager browser pool init
│   │   ├── type.ts               # Shared TypeScript types
│   │   ├── routes/
│   │   │   └── route.ts          # /health and /extract-theme endpoints
│   │   ├── puppeteer/
│   │   │   └── BrowserPool.ts    # Round-robin Chrome instance pool
│   │   └── utils/
│   │       ├── helpers.ts        # validateUrl, withTimeout, autoScroll
│   │       └── logger.ts         # Winston logger (file + console)
│   ├── .puppeteerrc.cjs          # Chrome cache path (project-local for Render)
│   ├── dockerfile                # Docker container config
│   ├── render.yaml               # Render deployment config
│   ├── Procfile                  # Process definition
│   └── package.json
│
└── ui/                           # Frontend
    ├── src/
    │   ├── App.tsx               # Root component, URL input, health check
    │   ├── types.ts              # ApiResponse type definitions
    │   └── components/
    │       └── panels/
    │           ├── OverviewPanel.tsx
    │           ├── ColorsPanel.tsx
    │           ├── TypographyPanel.tsx
    │           ├── AccessibilityPanel.tsx
    │           ├── ContentPanel.tsx
    │           └── LayoutPanel.tsx
    ├── vite.config.ts
    └── package.json
```

---

## Architecture

```
Browser (React UI)
  │
  │  POST /extract-theme { url }
  ▼
Express Server (Render)
  │
  ├── Validate URL
  ├── Acquire browser from pool (round-robin, 30s timeout)
  ├── Block images / fonts / media (memory optimization)
  ├── page.goto(url, { waitUntil: 'domcontentloaded' })
  │
  └── page.evaluate()  ← runs inside target site's browser context
        │
        ├── ALL_ELEMENTS = querySelectorAll(*).slice(0, 400)  ← memory cap
        │
        ├── extractTextContent()        h1–h6, p, li → markdown
        ├── extractColorPalette()       k-means on ALL_ELEMENTS colors
        ├── extractSemanticTheme()      nav/header/footer/button styles
        ├── extractVisualHierarchy()    size × position × font scoring
        ├── extractBrandColors()        logo parent background
        ├── detectCSSFramework()        class fingerprinting
        ├── extractTypographyScale()    modular ratio detection
        ├── extractAccessibleTheme()    WCAG contrast pairs
        └── extractLayoutPatterns()     grid + flex properties
              │
              ▼
        return { style, content }
              │
              ▼
        res.json() → React UI renders 6 panels
```

---

## Getting Started

### Prerequisites

- Node.js v20 or higher
- npm

### 1. Clone

```bash
git clone https://github.com/Gurkunwar-Singh/WebPatternAnalyzer
cd WebPatternAnalyzer/SourceCode
```

### 2. Install dependencies

```bash
npm install
# postinstall automatically runs: npx puppeteer browsers install chrome
```

### 3. Configure environment

Create a `.env` file in `SourceCode/`:

```env
PORT=3000
BROWSER_INSTANCES=1
ENVIRONMENT=development
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `BROWSER_INSTANCES` | `1` | Chrome instances in pool (use 1 on low-memory hosts) |
| `ENVIRONMENT` | `production` | Set `development` to expose debug ports |

### 4. Run

```bash
# Development (auto-reload)
npm run dev

# Production
npm run build && npm start
```

You should see:
```
info: Browser pool initialized successfully
info: Theme Extraction API Server listening on port 3000
```

### 5. Run the frontend

```bash
cd ../ui
npm install
npm run dev
```

---

## API Reference

### `GET /health`

```json
{
  "status": "healthy",
  "timestamp": "2026-04-30T10:00:00.000Z",
  "uptime": 120.4
}
```

### `POST /extract-theme`

**Request**
```json
{ "url": "https://example.com" }
```

**Response**
```json
{
  "style": {
    "colorPalette": ["rgb(255,255,255)", "rgb(26,26,26)"],
    "semanticTheme": {
      "navigation": { "background-color": "rgb(255,255,255)", "color": "rgb(26,26,26)" },
      "headings":   { "font-size": "30px", "font-weight": "700" }
    },
    "visualHierarchy": [
      { "selector": "div.hero", "weight": 0.99, "styles": { "fontSize": "48px" } }
    ],
    "cssFramework":   { "framework": "tailwind" },
    "typography":     { "scale": 1.25, "baseFontSize": 16, "fontSizes": [16,20,30,48] },
    "accessibility":  { "accessibleColorPairs": [...], "averageContrast": 12.4 },
    "layoutPatterns": { "grid": { "gap": "24px" }, "flexbox": { "flex-direction": "row" } },
    "metadata":       { "title": "Example", "url": "https://example.com", "extractedAt": "..." }
  },
  "content": "# Example\n\nPage text content in markdown..."
}
```

**Error responses**

| Status | Reason |
|---|---|
| `400` | Missing or invalid URL |
| `408` | Timeout (page load or browser acquisition) |
| `500` | Extraction failed — see `message` field |

---

## Testing the API

```bash
# curl
curl -X POST https://webstyle-analyzer.onrender.com/extract-theme \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# PowerShell
Invoke-WebRequest -Uri "https://webstyle-analyzer.onrender.com/extract-theme" `
  -Method POST -ContentType "application/json" `
  -Body '{"url": "https://example.com"}'
```

---

## Deployment Notes (Render Free Tier)

The backend is constrained to **512MB RAM**. These optimizations keep it within limits:

- `--single-process` Chrome flag (biggest memory saving)
- Resource interception — images, fonts, stylesheets, and media are blocked before load
- `waitUntil: 'domcontentloaded'` instead of `networkidle2`
- `ALL_ELEMENTS` capped at 400 elements, shared across all 8 algorithms
- `BROWSER_INSTANCES=1` — single Chrome instance
- Chrome installed inside project directory via `.puppeteerrc.cjs` so it persists through Render's build → deploy pipeline

---

## Running on WSL

Install required system libraries:

```bash
sudo apt-get update && sudo apt-get install -y \
  libgbm1 libasound2 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
  libxdamage1 libxfixes3 libxrandr2 libpango-1.0-0 \
  libcairo2 libnss3 libnspr4 libxss1 libxtst6 \
  fonts-liberation xdg-utils
```

---

## Docker

```bash
docker build -t web-pattern-analyzer .
docker run -p 3000:3000 -e BROWSER_INSTANCES=1 web-pattern-analyzer
```

---

## How K-Means Color Extraction Works

1. Collect `backgroundColor`, `color`, `borderColor` from ALL_ELEMENTS (max 400)
2. Convert each to an RGB vector `[r, g, b]`
3. Initialize K random centroids (K = 3–6 based on sample count)
4. Assign each color to the nearest centroid (Euclidean distance)
5. Recalculate each centroid as the mean of its cluster
6. Repeat until centroid shift < 5 RGB units or 10 iterations
7. Return centroids as the dominant palette

---

## Future Scope

- Dark mode and adaptive theme detection
- Batch analysis across thousands of URLs
- ML-based design quality scoring (trained on design system patterns)
- Longitudinal trend tracking — re-analyze URLs over time
- Export results as Figma tokens or CSS custom properties
- Docker Compose for one-command local deployment

---

## License

MIT © 2026 Gurkunwar Singh, Anshik Singh, Piyush
