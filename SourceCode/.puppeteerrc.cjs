// .puppeteerrc.cjs
const { join } = require('path');

module.exports = {
  cacheDirectory: join('/opt/render/.cache', 'puppeteer'),
  chrome: {
    skipDownload: false,
  },
};