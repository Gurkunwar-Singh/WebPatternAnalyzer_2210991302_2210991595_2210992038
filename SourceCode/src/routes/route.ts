import express, { Request, Response } from 'express';
import { autoScroll, validateUrl, withTimeout } from '../utils/helpers';
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

  if (!url) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  if (!validateUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL provided' });
  }

  let browserPoolItem: BrowserPoolItem;
  let page;

  try {
    // Get browser from pool with timeout
    browserPoolItem = await withTimeout(
      browserPool.getBrowser(),
      5000,
      'Browser acquisition timed out'
    );

    page = await browserPoolItem.browser.newPage();

    // Set page timeout
    page.setDefaultTimeout(60000);

    // Navigate with timeout
await withTimeout(
  page.goto(url, { waitUntil: 'networkidle2' }),
  60000,
  'Page navigation timed out'
);
await new Promise(resolve => setTimeout(resolve, 3000));

    await autoScroll(page);

    // Extract content and theme data
    const { content, theme } = await page.evaluate(() => {
      function htmlToMarkdown(node: Node): string {
        if (node.nodeType === Node.TEXT_NODE) {
          return (node.textContent || '').replace(/\s+/g, ' ');
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
          return '';
        }

        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        let md = '';

        switch (tag) {
          case 'h1':
            md += `# ${Array.from(el.childNodes).map(htmlToMarkdown).join('')}\n\n`;
            break;
          case 'h2':
            md += `## ${Array.from(el.childNodes).map(htmlToMarkdown).join('')}\n\n`;
            break;
          case 'h3':
            md += `### ${Array.from(el.childNodes).map(htmlToMarkdown).join('')}\n\n`;
            break;
          case 'p':
            md += `${Array.from(el.childNodes).map(htmlToMarkdown).join('')}\n\n`;
            break;
          case 'br':
            md += '  \n';
            break;
          case 'strong':
          case 'b':
            md += `**${Array.from(el.childNodes).map(htmlToMarkdown).join('')}**`;
            break;
          case 'em':
          case 'i':
            md += `*${Array.from(el.childNodes).map(htmlToMarkdown).join('')}*`;
            break;
          case 'a': {
            const href = el.getAttribute('href') || '';
            md += `[${Array.from(el.childNodes).map(htmlToMarkdown).join('')}](${href})`;
            break;
          }
          case 'img': {
            const src = el.getAttribute('src') || '';
            const alt = el.getAttribute('alt') || '';
            md += `![${alt}](${src})`;
            break;
          }

          case 'ul':
            md += `\n${Array.from(el.childNodes).map(htmlToMarkdown).join('')}\n`;
            break;
          case 'ol':
            md += `\n${Array.from(el.childNodes).map(htmlToMarkdown).join('')}\n`;
            break;
          case 'li':
            md += `- ${Array.from(el.childNodes).map(htmlToMarkdown).join('')}\n`;
            break;
          case 'blockquote':
            md += `> ${Array.from(el.childNodes).map(htmlToMarkdown).join('')}\n\n`;
            break;
          case 'pre':
            md += `\`\`\`\n${el.innerText}\n\`\`\`\n`;
            break;
          case 'code':
            md += `\`${el.innerText}\``;
            break;
          default:
            md += Array.from(el.childNodes).map(htmlToMarkdown).join('');
        }

        return md;
      }

      // Clean document (remove scripts/styles)
      document.querySelectorAll('script, style, noscript').forEach(el => el.remove());

      const bodyMarkdown = htmlToMarkdown(document.body);

      function isMeaningfulValue(property: string, value: string): boolean {
        if (!value || value.trim() === '') return false;

        const normalizedValue = value.trim().toLowerCase();

        switch (property) {
          case 'background':
          case 'background-color':
            return (
              normalizedValue !== 'rgba(0, 0, 0, 0)' &&
              normalizedValue !== 'transparent' &&
              normalizedValue !== 'initial' &&
              normalizedValue !== 'inherit'
            );

          case 'border':
          case 'border-color':
            return (
              !normalizedValue.includes('0px') &&
              normalizedValue !== 'none' &&
              normalizedValue !== 'initial' &&
              normalizedValue !== 'inherit'
            );

          case 'outline':
          case 'outline-color':
            return (
              !normalizedValue.includes('0px') &&
              normalizedValue !== 'none' &&
              normalizedValue !== 'initial' &&
              normalizedValue !== 'inherit'
            );

          default:
            return (
              normalizedValue !== 'initial' &&
              normalizedValue !== 'inherit' &&
              normalizedValue !== 'unset'
            );
        }
      }

      function extractColorPalette() {
        const colors: string[] = [];
        const elements = document.querySelectorAll('*');
        elements.forEach(el => {
          const styles = window.getComputedStyle(el);
          const bgColor = styles.backgroundColor;
          const textColor = styles.color;
          const borderColor = styles.borderColor;
          [bgColor, textColor, borderColor].forEach(color => {
            if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
              colors.push(color);
            }
          });
        });
        function rgbToArray(rgbString: string) {
          const match = rgbString.match(/rgba?\(([^)]+)\)/);
          if (!match) return null;
          return match[1].split(',').map(n => parseInt(n.trim()));
        }
        function colorDistance(color1: number[], color2: number[]) {
          const [r1, g1, b1] = color1;
          const [r2, g2, b2] = color2;
          return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
        }

        const colorArrays = colors.map(rgbToArray).filter(Boolean) as number[][];

        const k = Math.min(8, Math.max(5, Math.floor(colorArrays.length / 20)));
        let centroids: number[][] = [];

        for (let i = 0; i < k; i++) {
          centroids.push(colorArrays[Math.floor(Math.random() * colorArrays.length)]);
        }

        let clusters: number[][][] = [];
        let changed = true;

        while (changed) {
          clusters = Array(k)
            .fill(null)
            .map(() => []);
          changed = false;

          colorArrays.forEach(color => {
            let minDist = Infinity;
            let clusterIndex = 0;

            centroids.forEach((centroid, i) => {
              const dist = colorDistance(color, centroid);
              if (dist < minDist) {
                minDist = dist;
                clusterIndex = i;
              }
            });

            clusters[clusterIndex].push(color);
          });

          const newCentroids = clusters.map(cluster => {
            if (cluster.length === 0) return centroids[clusters.indexOf(cluster)];

            const sum = cluster.reduce(
              (acc, color) => {
                return [acc[0] + color[0], acc[1] + color[1], acc[2] + color[2]];
              },
              [0, 0, 0]
            );

            return [
              Math.round(sum[0] / cluster.length),
              Math.round(sum[1] / cluster.length),
              Math.round(sum[2] / cluster.length),
            ];
          });

          changed = centroids.some((centroid, i) => {
            return colorDistance(centroid, newCentroids[i]) > 5;
          });

          centroids = newCentroids;
        }

        return centroids.map(centroid => {
          return `rgb(${centroid[0]}, ${centroid[1]}, ${centroid[2]})`;
        });
      }

      function extractSemanticTheme() {
        const semanticMap: Record<string, string[]> = {
          primary: ['body', 'html', '[role="main"]', 'main'],
          navigation: ['nav', '[role="navigation"]', '.nav', '.navbar', '.menu'],
          header: ['header', '[role="banner"]', '.header', '.site-header'],
          footer: ['footer', '[role="contentinfo"]', '.footer', '.site-footer'],
          content: ['article', '[role="article"]', '.content', '.post', '.entry'],
          sidebar: ['aside', '[role="complementary"]', '.sidebar', '.widget-area'],
          buttons: ['button', '[role="button"]', '.btn', '.button', 'input[type="submit"]'],
          links: ['a', '[role="link"]'],
          forms: ['form', 'input', 'textarea', 'select'],
          headings: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
        };

        const theme: Record<string, Record<string, string>> = {};
        const themeProperties = [
          'background-color',
          'color',
          'border-color',
          'font-family',
          'font-size',
          'font-weight',
        ];

        Object.entries(semanticMap).forEach(([category, selectors]) => {
          const categoryStyles: Record<string, Record<string, number>> = {};

          selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              const styles = window.getComputedStyle(el);
              const rect = el.getBoundingClientRect();
              const weight = Math.min(rect.width * rect.height, 10000) / 10000;

              themeProperties.forEach(prop => {
                const value = styles.getPropertyValue(prop);
                if (isMeaningfulValue(prop, value)) {
                  if (!categoryStyles[prop]) categoryStyles[prop] = {};
                  categoryStyles[prop][value] = (categoryStyles[prop][value] || 0) + weight;
                }
              });
            });
          });

          theme[category] = Object.fromEntries(
            Object.entries(categoryStyles).map(([prop, values]) => [
              prop,
              Object.entries(values).sort(([, a], [, b]) => b - a)[0]?.[0] || '',
            ])
          );
        });

        return theme;
      }

      function extractVisualHierarchy() {
        function calculateVisualWeight(element: Element) {
          const rect = element.getBoundingClientRect();
          const styles = window.getComputedStyle(element);

          // Size weight
          const area = rect.width * rect.height;
          const sizeWeight = Math.min(area / (window.innerWidth * window.innerHeight), 1);

          // Position weight (elements higher up are more important)
          const positionWeight = 1 - rect.top / window.innerHeight;

          // Font size weight
          const fontSize = parseFloat(styles.fontSize) || 16;
          const fontWeight = Math.min(fontSize / 72, 1); // Normalize to 72px max

          // Contrast weight
          const bgColor = styles.backgroundColor;
          const textColor = styles.color;
          const contrastWeight = calculateContrast(bgColor, textColor);

          return {
            size: sizeWeight,
            position: Math.max(0, positionWeight),
            font: fontWeight,
            contrast: contrastWeight,
            total: (sizeWeight + positionWeight + fontWeight + contrastWeight) / 4,
          };
        }

        function calculateContrast(bg: string, fg: string) {
          // Simplified contrast calculation
          if (!bg || !fg) return 0.5;

          // Convert to RGB
          function parseColor(color: string): number[] {
            const div = document.createElement('div');
            div.style.color = color;
            document.body.appendChild(div);
            const rgb = window.getComputedStyle(div).color;
            document.body.removeChild(div);

            const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (match) {
              return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
            }
            return [0, 0, 0];
          }

          const bgRgb = parseColor(bg);
          const fgRgb = parseColor(fg);

          // Calculate relative luminance
          function getLuminance(rgb: number[]) {
            const [r, g, b] = rgb.map(c => {
              c /= 255;
              return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          }

          const lum1 = getLuminance(bgRgb);
          const lum2 = getLuminance(fgRgb);

          // Calculate contrast ratio
          const lighter = Math.max(lum1, lum2);
          const darker = Math.min(lum1, lum2);
          const contrast = (lighter + 0.05) / (darker + 0.05);

          // Normalize to 0-1 scale
          return Math.min(contrast / 21, 1); // Max contrast is 21:1
        }

        const elements = document.querySelectorAll('*');
        const weightedElements = Array.from(elements)
          .map(el => ({ element: el, weight: calculateVisualWeight(el) }))
          .sort((a, b) => b.weight.total - a.weight.total)
          .slice(0, 20); // Top 20 most important elements

        // Extract themes from these important elements
      
return weightedElements.map(({ element, weight }) => ({
  styles: {
    backgroundColor: window.getComputedStyle(element).backgroundColor,
    color: window.getComputedStyle(element).color,
    fontFamily: window.getComputedStyle(element).fontFamily,
    fontSize: window.getComputedStyle(element).fontSize,
  },
  weight: weight.total,
  selector:
    element.tagName.toLowerCase() +
    (typeof element.className === 'string' && element.className.trim()
      ? '.' + element.className.trim().split(/\s+/)[0]
      : ''),
}));
      }

      // 4. Brand Color Detection Algorithm
      function extractBrandColors() {
        const images = document.querySelectorAll('img, svg, [style*="background-image"]');
        const brandColors: any[] = [];

        images.forEach(img => {
          if (img.tagName === 'IMG') {
            // For logos/brand images (usually smaller, in header/nav)
            const rect = img.getBoundingClientRect();
            const isLikelyLogo = rect.height < 100 && rect.width < 300;

            if (isLikelyLogo) {
              // Get the parent element's background color as potential brand color
              const parentBg = window.getComputedStyle(
                img.parentElement || document.body
              ).backgroundColor;
              if (parentBg && parentBg !== 'rgba(0, 0, 0, 0)' && parentBg !== 'transparent') {
                brandColors.push({
                  source: 'logo-background',
                  color: parentBg,
                  importance: 'high',
                });
              }
            }
          }
        });

        return brandColors;
      }

      // 5. CSS Framework Detection
      function detectCSSFramework() {
        const frameworks = {
          bootstrap: {
            selectors: ['.container', '.row', '.col', '.btn-primary'],
            variables: ['--bs-primary', '--bs-secondary', '--bs-success'],
          },
          tailwind: {
            selectors: ['.bg-blue-500', '.text-gray-900', '.p-4'],
            variables: [], // Tailwind uses utility classes
          },
          bulma: {
            selectors: ['.hero', '.navbar', '.button.is-primary'],
            variables: [],
          },
          foundation: {
            selectors: ['.grid-x', '.cell', '.button.primary'],
            variables: [],
          },
        };

        let detectedFramework = null;
        let maxMatches = 0;

        Object.entries(frameworks).forEach(([name, config]) => {
          const matches = config.selectors.reduce((count, selector) => {
            return count + document.querySelectorAll(selector).length;
          }, 0);

          if (matches > maxMatches) {
            maxMatches = matches;
            detectedFramework = name;
          }
        });

        if (detectedFramework) {
          // Extract framework-specific theme variables
          const framework = (frameworks as any)[detectedFramework];
          const theme: Record<string, string> = {
            framework: detectedFramework,
          };

          framework.variables.forEach((varName: string) => {
            const value = getComputedStyle(document.documentElement).getPropertyValue(varName);
            if (value) theme[varName] = value.trim();
          });

          return theme;
        }

        return null;
      }

      // 6. Typography Scale Analysis
      function extractTypographyScale() {
        const textElements = document.querySelectorAll(
          'h1, h2, h3, h4, h5, h6, p, span, div, a, button'
        );
        const fontSizes: number[] = [];
        const fontFamilies: Record<string, number> = {};
        const fontWeights: Record<string, number> = {};

        textElements.forEach(el => {
          const styles = window.getComputedStyle(el);
          const fontSize = parseFloat(styles.fontSize);
          const fontFamily = styles.fontFamily;
          const fontWeight = styles.fontWeight;

          if (fontSize && fontSize > 0) {
            fontSizes.push(fontSize);
          }

          if (fontFamily) {
            fontFamilies[fontFamily] = (fontFamilies[fontFamily] || 0) + 1;
          }

          if (fontWeight) {
            fontWeights[fontWeight] = (fontWeights[fontWeight] || 0) + 1;
          }
        });

        // Detect typography scale (1.125, 1.2, 1.25, 1.333, 1.414, 1.5, 1.618)
        const uniqueSizes = [...new Set(fontSizes)].sort((a, b) => a - b);
        const scales = [1.125, 1.2, 1.25, 1.333, 1.414, 1.5, 1.618];

        let bestScale = null;
        let bestMatch = 0;

        scales.forEach(scale => {
          let matches = 0;
          const baseSize = Math.min(...uniqueSizes);

          uniqueSizes.forEach(size => {
            const expectedSize =
              baseSize * Math.pow(scale, Math.round(Math.log(size / baseSize) / Math.log(scale)));
            if (Math.abs(size - expectedSize) < 2) matches++;
          });

          if (matches > bestMatch) {
            bestMatch = matches;
            bestScale = scale;
          }
        });

        return {
          scale: bestScale,
          baseFontSize: Math.min(...uniqueSizes),
          fontSizes: uniqueSizes,
          primaryFontFamily: Object.entries(fontFamilies).sort(([, a], [, b]) => b - a)[0]?.[0],
          primaryFontWeight: Object.entries(fontWeights).sort(([, a], [, b]) => b - a)[0]?.[0],
        };
      }

      // 7. Accessibility-Aware Theme Extraction
      function extractAccessibleTheme() {
        function getContrastRatio(color1: string, color2: string) {
          // Convert to RGB and calculate WCAG contrast ratio
          function parseColor(color: string): number[] {
            const div = document.createElement('div');
            div.style.color = color;
            document.body.appendChild(div);
            const rgb = window.getComputedStyle(div).color;
            document.body.removeChild(div);

            const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (match) {
              return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
            }
            return [0, 0, 0];
          }

          function getLuminance(rgb: number[]) {
            const [r, g, b] = rgb.map(c => {
              c /= 255;
              return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          }

          const rgb1 = parseColor(color1);
          const rgb2 = parseColor(color2);

          const lum1 = getLuminance(rgb1);
          const lum2 = getLuminance(rgb2);

          const lighter = Math.max(lum1, lum2);
          const darker = Math.min(lum1, lum2);
          return (lighter + 0.05) / (darker + 0.05);
        }

        const accessiblePairs: any[] = [];
        const elements = document.querySelectorAll('*');

        elements.forEach(el => {
          const styles = window.getComputedStyle(el);
          const bgColor = styles.backgroundColor;
          const textColor = styles.color;

          if (bgColor && textColor && bgColor !== 'rgba(0, 0, 0, 0)') {
            const contrast = getContrastRatio(bgColor, textColor);

            if (contrast >= 4.5) {
              // WCAG AA standard
              accessiblePairs.push({
                background: bgColor,
                foreground: textColor,
                contrast: contrast,
                element: el.tagName.toLowerCase(),
              });
            }
          }
        });

        return {
          accessibleColorPairs: accessiblePairs.slice(0, 10),
          averageContrast:
            accessiblePairs.reduce((sum, pair) => sum + pair.contrast, 0) /
              accessiblePairs.length || 0,
        };
      }

      // 8. Layout Pattern Recognition
      function extractLayoutPatterns() {
        const patterns = {
          grid: {
            selectors: ['.grid', '.grid-container', '[style*="grid"]', '[class*="grid"]'],
            properties: ['grid-template-columns', 'grid-gap', 'gap'],
          },
          flexbox: {
            selectors: ['[style*="flex"]', '[class*="flex"]', '.d-flex'],
            properties: ['flex-direction', 'justify-content', 'align-items', 'gap'],
          },
          spacing: {
            selectors: ['*'],
            properties: [
              'margin',
              'padding',
              'margin-top',
              'margin-bottom',
              'padding-left',
              'padding-right',
            ],
          },
        };

        const layoutTheme: Record<string, Record<string, string>> = {};

        Object.entries(patterns).forEach(([patternName, config]) => {
          const values: Record<string, Record<string, number>> = {};

          config.selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
              const styles = window.getComputedStyle(el);

              config.properties.forEach(prop => {
                const value = styles.getPropertyValue(prop);
                if (value && value !== 'initial' && value !== 'normal') {
                  values[prop] = values[prop] || {};
                  values[prop][value] = (values[prop][value] || 0) + 1;
                }
              });
            });
          });

          // Get most common values for each property
          layoutTheme[patternName] = Object.fromEntries(
            Object.entries(values).map(([prop, freqs]) => [
              prop,
              Object.entries(freqs).sort(([, a], [, b]) => b - a)[0]?.[0] || '',
            ])
          );
        });

        return layoutTheme;
      }

      // Extract both content and theme
      const content = bodyMarkdown;
      const theme = {
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
      };

      return { content, theme };
    });
    let responseObject = {
      style: theme,
      content: content,
    };

    if (ENVIRONMENT === 'development') {
      responseObject['debugPort'] = browserPoolItem.linkedPort || null;
    }
    res.json(responseObject);
  } catch (error) {
    console.error('Theme extraction error:', error);

    if (error instanceof Error) {
      if (error.message.includes('timed out')) {
        return res.status(408).json({
          error: 'Request timeout',
          message: error.message,
        });
      }

      return res.status(500).json({
        error: 'Failed to extract theme',
        message: error.message,
      });
    }

    res.status(500).json({
      error: 'Unknown error occurred during theme extraction',
    });
  } finally {
    // Cleanup: close page but keep browser in pool
    if (page && !page.isClosed()) {
      try {
        await page.close();
      } catch (closeError) {
        console.error('Error closing page:', closeError);
      }
    }

    // Browser automatically returns to pool via the pool manager
  }
});

// Graceful shutdown handling
let isShuttingDown = false;

process.on('SIGINT', async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('Received SIGINT. Shutting down gracefully...');
  await gracefulShutdown();
});

process.on('SIGTERM', async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('Received SIGTERM. Shutting down gracefully...');
  await gracefulShutdown();
});

async function gracefulShutdown() {
  console.log('Closing browser pool...');
  try {
    await browserPool.closeAll();
    console.log('Browser pool closed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', async error => {
  console.error('Uncaught exception:', error);
  await gracefulShutdown();
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  await gracefulShutdown();
});

export default router;
