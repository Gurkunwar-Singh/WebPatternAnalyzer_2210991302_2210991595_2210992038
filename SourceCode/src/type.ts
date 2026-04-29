import { Browser } from 'puppeteer';
export interface BrowserPoolItem {
  browser: Browser;
  linkedPort?: number;
}
