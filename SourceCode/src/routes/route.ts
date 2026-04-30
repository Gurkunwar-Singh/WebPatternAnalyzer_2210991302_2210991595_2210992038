import express, { Request, Response } from 'express';
import { validateUrl, withTimeout } from '../utils/helpers';
import { browserPool } from '../puppeteer/BrowserPool';
import { BrowserPoolItem } from '../type';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();
const ENVIRONMENT = process.env.ENVIRONMENT || 'production';

router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

router.post('/extract-theme', async (req: Request, res: Response) => {
  res.setTimeout(120000);
  const { url } = req.body;

  if (!url) return res.status(400).json({ error: 'Missing required parameters' });
  if (!validateUrl(url)) return res.status(400).json({ error: 'Invalid URL provided' });

  let browserPoolItem: BrowserPoolItem;
  let page: any;

  try {
    browserPoolItem = await withTimeout(
      browserPool.getBrowser(),
      30000,
      'Browser acquisition timed out'
    );

    page = await browserPoolItem.browser.newPage();
    page.setDefaultTimeout(60000);

    // Block heavy resources to save memory
    await page.setRequestInterception(true);
    page.on('request', (req: any) => {
      const type = req.resourceType();
      if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // domcontentloaded is much lighter than networkidle2
    await withTimeout(
      page.goto(url, { waitUntil: 'domcontentloaded' }),
      60000,
      'Page navigation timed out'
    );

    const { content, theme } = await page.evaluate(() => {
      // ── Single shared element cap — used by ALL functions ──
      const ALL_ELEMENTS = Array.from(document.querySelectorAll('*')).slice(0, 400);

      // ── Markdown: only extract visible text, skip full recursion ──
      function extractTextContent(): string {
        const blocks: string[] = [];
        const tags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'blockquote'];
        tags.forEach(tag => {
          document.querySelectorAll(tag).forEach((el: Element) => {
            const text = (el as HTMLElement).innerText?.trim();
            if (text && text.length > 0 && text.length < 500) {
              const prefix = tag.startsWith('h') ? '#'.repeat(parseInt(tag[1])) + ' ' : '';
              blocks.push(prefix + text);
            }
          });
        });
        return blocks.slice(0, 200).join('\n\n');
      }

      function isMeaningfulValue(property: string, value: string): boolean {
        if (!value || value.trim() === '') return false;
        const v = value.trim().toLowerCase();
        if (['initial', 'inherit', 'unset'].includes(v)) return false;
        if (['background', 'background-color'].includes(property)) {
          return v !== 'rgba(0, 0, 0, 0)' && v !== 'transparent';
        }
        if (['border', 'border-color', 'outline', 'outline-color'].includes(property)) {
          return !v.includes('0px') && v !== 'none';
        }
        return true;
      }

      function extractColorPalette() {
        const colors: string[] = [];
        ALL_ELEMENTS.forEach((el: Element) => {
          const styles = window.getComputedStyle(el);
          [styles.backgroundColor, styles.color, styles.borderColor].forEach(c => {
            if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') colors.push(c);
          });
        });

        function rgbToArray(s: string) {
          const m = s.match(/rgba?\(([^)]+)\)/);
          return m ? m[1].split(',').map(n => parseInt(n.trim())) : null;
        }
        function dist(a: number[], b: number[]) {
          return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
        }

        const arrays = colors.map(rgbToArray).filter(Boolean) as number[][];
        if (arrays.length === 0) return [];

        const k = Math.min(6, Math.max(3, Math.floor(arrays.length / 20)));
        let centroids = arrays.slice(0, k);
        let changed = true;

        for (let iter = 0; iter < 10 && changed; iter++) {
          const clusters: number[][][] = Array(k).fill(null).map(() => []);
          arrays.forEach(c => {
            let min = Infinity, idx = 0;
            centroids.forEach((cen, i) => { const d = dist(c, cen); if (d < min) { min = d; idx = i; } });
            clusters[idx].push(c);
          });
          const next = clusters.map((cl, i) => {
            if (!cl.length) return centroids[i];
            const sum = cl.reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]], [0, 0, 0]);
            return sum.map(v => Math.round(v / cl.length));
          });
          changed = centroids.some((c, i) => dist(c, next[i]) > 5);
          centroids = next;
        }
        return centroids.map(c => `rgb(${c[0]}, ${c[1]}, ${c[2]})`);
      }

      function extractSemanticTheme() {
        const semanticMap: Record<string, string[]> = {
          primary: ['body', 'main'],
          navigation: ['nav', 'header'],
          footer: ['footer'],
          buttons: ['button', 'input[type="submit"]'],
          links: ['a'],
          headings: ['h1', 'h2', 'h3'],
        };
        const props = ['background-color', 'color', 'font-family', 'font-size', 'font-weight'];
        const theme: Record<string, Record<string, string>> = {};

        Object.entries(semanticMap).forEach(([cat, selectors]) => {
          const catStyles: Record<string, Record<string, number>> = {};
          selectors.forEach(sel => {
            // Cap each selector to 10 elements
            Array.from(document.querySelectorAll(sel)).slice(0, 10).forEach((el: Element) => {
              const styles = window.getComputedStyle(el);
              const rect = el.getBoundingClientRect();
              const weight = Math.min(rect.width * rect.height, 10000) / 10000;
              props.forEach(prop => {
                const val = styles.getPropertyValue(prop);
                if (isMeaningfulValue(prop, val)) {
                  catStyles[prop] = catStyles[prop] || {};
                  catStyles[prop][val] = (catStyles[prop][val] || 0) + weight;
                }
              });
            });
          });
          theme[cat] = Object.fromEntries(
            Object.entries(catStyles).map(([p, vals]) => [
              p,
              Object.entries(vals).sort(([, a], [, b]) => b - a)[0]?.[0] || ''
            ])
          );
        });
        return theme;
      }

      function extractVisualHierarchy() {
        function getLuminance(rgb: number[]) {
          return rgb.map(c => {
            c /= 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
          }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
        }

        return ALL_ELEMENTS
          .map((el: Element) => {
            const rect = el.getBoundingClientRect();
            const styles = window.getComputedStyle(el);
            const area = rect.width * rect.height;
            const sizeW = Math.min(area / (window.innerWidth * window.innerHeight), 1);
            const posW = Math.max(0, 1 - rect.top / window.innerHeight);
            const fontSize = parseFloat(styles.fontSize) || 16;
            const fontW = Math.min(fontSize / 72, 1);
            const total = (sizeW + posW + fontW) / 3;
            return {
              styles: {
                backgroundColor: styles.backgroundColor,
                color: styles.color,
                fontFamily: styles.fontFamily,
                fontSize: styles.fontSize,
              },
              weight: total,
              selector: el.tagName.toLowerCase() +
                (typeof (el as HTMLElement).className === 'string' && (el as HTMLElement).className.trim()
                  ? '.' + (el as HTMLElement).className.trim().split(/\s+/)[0] : ''),
            };
          })
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 20);
      }

      function extractBrandColors() {
        const brandColors: any[] = [];
        Array.from(document.querySelectorAll('img')).slice(0, 20).forEach((img: Element) => {
          const rect = img.getBoundingClientRect();
          if (rect.height < 100 && rect.width < 300) {
            const parentBg = window.getComputedStyle(
              (img as HTMLElement).parentElement || document.body
            ).backgroundColor;
            if (parentBg && parentBg !== 'rgba(0, 0, 0, 0)' && parentBg !== 'transparent') {
              brandColors.push({ source: 'logo-background', color: parentBg, importance: 'high' });
            }
          }
        });
        return brandColors;
      }

      function detectCSSFramework() {
        const frameworks: Record<string, { selectors: string[]; variables: string[] }> = {
          bootstrap: { selectors: ['.container', '.row', '.btn-primary'], variables: ['--bs-primary'] },
          tailwind: { selectors: ['.bg-blue-500', '.text-gray-900'], variables: [] },
          bulma: { selectors: ['.hero', '.button.is-primary'], variables: [] },
        };
        let best: string | null = null, max = 0;
        Object.entries(frameworks).forEach(([name, cfg]) => {
          const count = cfg.selectors.reduce((n, sel) => n + document.querySelectorAll(sel).length, 0);
          if (count > max) { max = count; best = name; }
        });
        if (!best) return null;
        const theme: Record<string, string> = { framework: best };
        frameworks[best].variables.forEach(v => {
          const val = getComputedStyle(document.documentElement).getPropertyValue(v);
          if (val) theme[v] = val.trim();
        });
        return theme;
      }

      function extractTypographyScale() {
        // Only heading + p tags — not div/span
        const els = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,p')).slice(0, 100);
        const fontSizes: number[] = [];
        const fontFamilies: Record<string, number> = {};
        const fontWeights: Record<string, number> = {};

        els.forEach((el: Element) => {
          const s = window.getComputedStyle(el);
          const fs = parseFloat(s.fontSize);
          if (fs > 0) fontSizes.push(fs);
          if (s.fontFamily) fontFamilies[s.fontFamily] = (fontFamilies[s.fontFamily] || 0) + 1;
          if (s.fontWeight) fontWeights[s.fontWeight] = (fontWeights[s.fontWeight] || 0) + 1;
        });

        const unique = [...new Set(fontSizes)].sort((a, b) => a - b);
        const scales = [1.125, 1.2, 1.25, 1.333, 1.414, 1.5, 1.618];
        let bestScale = null, bestMatch = 0;
        const base = Math.min(...unique);

        scales.forEach(scale => {
          let matches = 0;
          unique.forEach(size => {
            const exp = base * Math.pow(scale, Math.round(Math.log(size / base) / Math.log(scale)));
            if (Math.abs(size - exp) < 2) matches++;
          });
          if (matches > bestMatch) { bestMatch = matches; bestScale = scale; }
        });

        return {
          scale: bestScale,
          baseFontSize: base,
          fontSizes: unique.slice(0, 20),
          primaryFontFamily: Object.entries(fontFamilies).sort(([, a], [, b]) => b - a)[0]?.[0],
          primaryFontWeight: Object.entries(fontWeights).sort(([, a], [, b]) => b - a)[0]?.[0],
        };
      }

      function extractAccessibleTheme() {
        function parseRgb(color: string): number[] {
          const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
        }
        function getLum(rgb: number[]) {
          return rgb.map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); })
            .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
        }

        const pairs: any[] = [];
        ALL_ELEMENTS.forEach((el: Element) => {
          const s = window.getComputedStyle(el);
          const bg = s.backgroundColor, fg = s.color;
          if (!bg || bg === 'rgba(0, 0, 0, 0)') return;
          const l1 = getLum(parseRgb(bg)), l2 = getLum(parseRgb(fg));
          const contrast = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          if (contrast >= 4.5) pairs.push({ background: bg, foreground: fg, contrast, element: el.tagName.toLowerCase() });
        });

        return {
          accessibleColorPairs: pairs.slice(0, 10),
          averageContrast: pairs.length ? pairs.reduce((s, p) => s + p.contrast, 0) / pairs.length : 0,
        };
      }

      function extractLayoutPatterns() {
        const layout: Record<string, Record<string, string>> = {};

        // Grid — capped
        const gridEls = Array.from(document.querySelectorAll('.grid, [class*="grid"]')).slice(0, 50);
        const gridVals: Record<string, Record<string, number>> = {};
        gridEls.forEach((el: Element) => {
          const s = window.getComputedStyle(el);
          ['grid-template-columns', 'gap'].forEach(p => {
            const v = s.getPropertyValue(p);
            if (v && v !== 'none' && v !== 'normal') {
              gridVals[p] = gridVals[p] || {};
              gridVals[p][v] = (gridVals[p][v] || 0) + 1;
            }
          });
        });
        layout.grid = Object.fromEntries(Object.entries(gridVals).map(([p, f]) =>
          [p, Object.entries(f).sort(([, a], [, b]) => b - a)[0]?.[0] || '']
        ));

        // Flex — capped
        const flexEls = Array.from(document.querySelectorAll('[class*="flex"], .d-flex')).slice(0, 50);
        const flexVals: Record<string, Record<string, number>> = {};
        flexEls.forEach((el: Element) => {
          const s = window.getComputedStyle(el);
          ['flex-direction', 'justify-content', 'align-items'].forEach(p => {
            const v = s.getPropertyValue(p);
            if (v && v !== 'normal') {
              flexVals[p] = flexVals[p] || {};
              flexVals[p][v] = (flexVals[p][v] || 0) + 1;
            }
          });
        });
        layout.flexbox = Object.fromEntries(Object.entries(flexVals).map(([p, f]) =>
          [p, Object.entries(f).sort(([, a], [, b]) => b - a)[0]?.[0] || '']
        ));

        return layout;
      }

      return {
        content: extractTextContent(),
        theme: {
          colorPalette: extractColorPalette(),
          semanticTheme: extractSemanticTheme(),
          visualHierarchy: extractVisualHierarchy(),
          brandColors: extractBrandColors(),
          cssFramework: detectCSSFramework(),
          typography: extractTypographyScale(),
          accessibility: extractAccessibleTheme(),
          layoutPatterns: extractLayoutPatterns(),
          metadata: {
            title: document.title,
            url: window.location.href,
            extractedAt: new Date().toISOString(),
          },
        },
      };
    });

    const responseObject: any = { style: theme, content };
    if (ENVIRONMENT === 'development') responseObject.debugPort = browserPoolItem.linkedPort || null;
    res.json(responseObject);

  } catch (error) {
    console.error('Theme extraction error:', error);
    if (error instanceof Error) {
      if (error.message.includes('timed out')) {
        return res.status(408).json({ error: 'Request timeout', message: error.message });
      }
      return res.status(500).json({ error: 'Failed to extract theme', message: error.message });
    }
    res.status(500).json({ error: 'Unknown error occurred during theme extraction' });
  } finally {
    if (page && !page.isClosed()) {
      try { await page.close(); } catch (e) { console.error('Error closing page:', e); }
    }
  }
});

// Graceful shutdown
let isShuttingDown = false;
async function gracefulShutdown() {
  console.log('Closing browser pool...');
  try { await browserPool.closeAll(); process.exit(0); }
  catch (e) { console.error('Shutdown error:', e); process.exit(1); }
}
process.on('SIGINT', async () => { if (!isShuttingDown) { isShuttingDown = true; await gracefulShutdown(); } });
process.on('SIGTERM', async () => { if (!isShuttingDown) { isShuttingDown = true; await gracefulShutdown(); } });
process.on('uncaughtException', async e => { console.error('Uncaught:', e); await gracefulShutdown(); });
process.on('unhandledRejection', async (r) => { console.error('Unhandled rejection:', r); await gracefulShutdown(); });

export default router;