// .puppeteerrc.cjs
const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Specify where browsers should be cached
  cacheDirectory: join('/opt/render/.cache', 'puppeteer'),
  
  // Explicitly tell Puppeteer to download Chrome
  chrome: {
    skipDownload: false,
  },
};