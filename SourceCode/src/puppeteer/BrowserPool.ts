// src/utils/browserPool.ts
import dotenv from 'dotenv';
import puppeteer, { Browser,executablePath  } from 'puppeteer';
import { BrowserPoolItem } from '../type';
import logger from '../utils/logger';

dotenv.config();

const BROWSER_INSTANCES = parseInt(process.env.BROWSER_INSTANCES || '2');
let BROWSER_INSTANCE_DEBUG_PORT_STARTING = parseInt(
  process.env.BROWSER_INSTANCE_DEBUG_PORT || '1001'
);
const ENVIRONMENT = process.env.ENVIRONMENT || 'production';
const PROXIES = process.env.PROXIES ? process.env.PROXIES.split(',') : [];
// function getChromePath(): string | undefined {
//   if (process.env.NODE_ENV !== 'production') return undefined;
  
//   // All possible Chrome/Chromium locations on Render
//   const possiblePaths = [
//     '/opt/render/.cache/puppeteer/chrome/linux-147.0.7727.57/chrome-linux64/chrome',
//     '/opt/render/project/src/SourceCode/.local-chrome/chrome-linux64/chrome',
//     process.env.PUPPETEER_EXECUTABLE_PATH,
//     '/usr/bin/google-chrome',
//     '/usr/bin/chromium',
//     '/usr/bin/chromium-browser',
//   ].filter(Boolean);
  
//   for (const path of possiblePaths) {
//     try {
//       const fs = require('fs');
//       if (fs.existsSync(path) && fs.accessSync(path, fs.constants.X_OK) === undefined) {
//         console.log(`Found Chrome at: ${path}`);
//         return path;
//       }
//     } catch (err) {
      
//     }
//   }
  
//   console.warn('⚠️ No Chrome executable found, relying on Puppeteer default');
//   return undefined;
// }

// Then in initialize():
// const chromePath = getChromePath();
class BrowserPool {
  private pool: BrowserPoolItem[] = [];
  private maxPoolSize: number;
  private isInitialized = false;

  constructor(maxPoolSize = 2) {
    this.maxPoolSize = maxPoolSize;
  }

//   async initialize(): Promise<void> {
//   if (this.isInitialized) return;

//   logger.info(`Initializing browser pool with ${this.maxPoolSize} instances`);
  
//   for (let i = 0; i < this.maxPoolSize; i++) {
//     let launchArgs: string[] = [
//       '--no-sandbox',
//       '--disable-setuid-sandbox',
//       '--disable-dev-shm-usage',
//       '--disable-gpu',
//       '--disable-web-security',
//       '--disable-features=IsolateOrigins,site-per-process',
//       '--window-size=1920,1080',
//       '--disable-accelerated-2d-canvas',
//       '--no-first-run',
//       '--no-zygote',
//       '--disable-extensions'
//     ];

//     let linkedPort: number | undefined;

//     if (ENVIRONMENT === 'development') {
//       linkedPort = BROWSER_INSTANCE_DEBUG_PORT_STARTING++;
//       launchArgs.push(`--remote-debugging-port=${linkedPort}`);
//     }

//     try {
//       // Let Puppeteer find Chrome automatically
//       const browser: Browser = await puppeteer.launch({
//         headless: true,
//         args: launchArgs,
//         // Remove executablePath - let Puppeteer find it
//       });

//       this.pool.push({
//         browser,
//         linkedPort,
//       });
      
//       logger.info(`Browser instance ${i + 1}/${this.maxPoolSize} initialized`);
//     } catch (error) {
//       logger.error(`Failed to launch browser instance ${i}:`, error);
//       throw error;
//     }
//   }

//   this.isInitialized = true;
//   logger.info('Browser pool initialized successfully');
// }
// src/utils/browserPool.ts
// src/utils/browserPool.ts



// src/utils/browserPool.ts
// src/utils/browserPool.ts
// src/utils/browserPool.ts - Simplified initialize method
// src/utils/browserPool.ts
async initialize(): Promise<void> {
  if (this.isInitialized) return;

  const chromePath = executablePath();
  logger.info(`Resolved Chrome path: ${chromePath}`);
 const fs = require('fs');
  if (!fs.existsSync(chromePath)) {
    throw new Error(`Chrome not found at: ${chromePath}. Run: npx puppeteer browsers install chrome`);
  };
  logger.info(`Initializing browser pool with ${this.maxPoolSize} instances`);

  const launchArgs: string[] = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--single-process',
    '--disable-gpu',
    '--no-first-run',
    '--no-zygote',
  ];

  for (let i = 0; i < this.maxPoolSize; i++) {
    try {
      const browser = await puppeteer.launch({
        headless: true,
        executablePath: chromePath,
        args: launchArgs,
      });

      this.pool.push({ browser, linkedPort: undefined });
      logger.info(`Browser instance ${i + 1}/${this.maxPoolSize} initialized`);
    } catch (error) {
      logger.error(`Failed to launch browser:`, error);
      throw error;
    }
  }

  this.isInitialized = true;
}
  async getBrowser(): Promise<BrowserPoolItem> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (this.pool.length === 0) {
      throw new Error('No browsers available in pool');
    }
    
    const browser = this.pool.shift()!;
    this.pool.push(browser);
    return browser;
  }

  async closeAll() {
    logger.info('Closing all browser instances...');
    await Promise.all(this.pool.map(item => item.browser.close()));
    this.pool = [];
    this.isInitialized = false;
    logger.info('All browser instances closed');
  }
}

export const browserPool = new BrowserPool(BROWSER_INSTANCES);

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing browser pool...');
  await browserPool.closeAll();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing browser pool...');
  await browserPool.closeAll();
  process.exit(0);
});