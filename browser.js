import chromium from "@sparticuz/chromium";
import playwright from "playwright-core";
import fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';

// Set higher limit for EventEmitter to prevent memory warnings
EventEmitter.defaultMaxListeners = 30;

// Keep track of temp directories to clean up on exit
const tempDirectories = [];

// Clean up function for handling exit
async function cleanupResources() {
  console.log('Cleaning up resources...');
  
  // Clean up temporary directories
  for (const dir of tempDirectories) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      console.log(`Removed temporary directory: ${dir}`);
    } catch (error) {
      console.error(`Failed to remove directory ${dir}:`, error);
    }
  }
}

// Register cleanup handlers
process.on('exit', () => {
  console.log('Process exit detected, cleaning up...');
  // Use sync operations since we're in exit handler
  for (const dir of tempDirectories) {
    try {
      fsSync.rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to remove directory ${dir} during exit:`, error);
    }
  }
});

// Handle other termination signals
['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
  process.on(signal, async () => {
    console.log(`Received ${signal}, cleaning up before exit...`);
    await cleanupResources();
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('Uncaught exception:', error);
  await cleanupResources();
  process.exit(1);
});

async function openBrowser(options = {}) {
  const platform = process.platform;
  let browser;
  let launchOptions = {
    headless: options.headless ?? true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ],
    ignoreDefaultArgs: false
  };

  // Universal Linux (selain Ubuntu)
  const isLinux = platform === 'linux';
  // Ubuntu biasanya terdeteksi sebagai 'linux', jadi kita cek env
  const isUbuntu = isLinux && (process.env.XDG_CURRENT_DESKTOP?.toLowerCase().includes('ubuntu') || process.env.DESKTOP_SESSION?.toLowerCase().includes('ubuntu'));
  const isMac = platform === 'darwin';
  const isWin = platform === 'win32';

  if (isWin) {
    // Windows
    launchOptions = {
      ...launchOptions,
      channel: 'chrome', // gunakan Chrome jika ada
      args: [
        ...launchOptions.args,
        '--disable-accelerated-2d-canvas',
        '--disable-dev-shm-usage',
        '--disable-features=site-per-process',
        '--window-size=1280,720'
      ]
    };
  } else if (isMac) {
    // macOS
    launchOptions = {
      ...launchOptions,
      channel: 'chrome',
      args: [
        ...launchOptions.args,
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-ipc-flooding-protection',
        '--disable-hang-monitor',
        '--window-size=1280,720'
      ]
    };
  } else if (isUbuntu) {
    // Ubuntu
    launchOptions = {
      ...launchOptions,
      args: [
        ...launchOptions.args,
        '--disable-accelerated-2d-canvas',
        '--disable-dev-shm-usage',
        '--disable-features=site-per-process',
        '--window-size=1280,720'
      ]
    };
  } else if (isLinux) {
    // Universal Linux (selain Ubuntu)
    launchOptions = {
      ...launchOptions,
      args: [
        ...launchOptions.args,
        '--disable-accelerated-2d-canvas',
        '--disable-dev-shm-usage',
        '--disable-features=site-per-process',
        '--window-size=1280,720'
      ]
    };
  }

  // Jika ada opsi executablePath dari sparticuz/chromium, tambahkan
  if (!isMac && !isWin) {
    const executablePath = await chromium.executablePath();
    launchOptions.executablePath = executablePath;
  }

  // console.log('browser options:', JSON.stringify(launchOptions, null, 2));
  try {
    browser = await playwright.chromium.launch(launchOptions);
    console.log('Browser launched successfully');
  } catch (err) {
    console.error('Browser launch failed:', err.message);
    throw err;
  }
  return browser;
}

async function closeBrowser(browser) {
  try {
    if (!browser) {
      console.warn('Browser instance is null or undefined. Nothing to close.');
      return;
    }
    
    await browser.close();
    console.log('Browser closed.');
    
    // Trigger cleanup of temporary directories
    await cleanupResources();
    
  } catch (error) {
    console.error('Error closing browser:', error);
    // Still try to clean up resources even if browser close fails
    try {
      await cleanupResources();
    } catch (cleanupError) {
      console.error('Error during resource cleanup:', cleanupError);
    }
    throw error;
  }
}

async function scroll(page, selector) {
  try {
    await page.waitForSelector(selector, { timeout: 1500, state: 'attached' });
    await page.evaluate(async(selector) => {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const element = document.querySelector(selector);
      if (element) {
        for (let i = 0; i < element.scrollHeight; i += 100) {
          element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' }, i);
          await delay(100 * (i/element.scrollHeight));
        }
      } else {
        console.warn('Element not found:', selector);
      }
    }, selector);
  } catch (error) {
    throw error;
  }
}

async function waitForScrollFeed(page, maxScroll = 10) {
  let previousHeight;
  let currentHeight = 0;
  const maxScrollAttempts = maxScroll; // Batasi jumlah scroll
  let attemptCount = 0;

  while (previousHeight !== currentHeight && attemptCount < maxScrollAttempts) {
    previousHeight = currentHeight;
    
    // Scroll ke bawah
    await scroll(page, "[role='feed']");
    
    // Tunggu content baru dimuat
    await page.waitForTimeout(2500 * (attemptCount + 1 / 2));
    
    // Dapatkan tinggi baru
    currentHeight = await page.evaluate(() => {
      const feed = document.querySelector("[role='feed']");
      return feed ? feed.scrollHeight : 0;
    });
    
    console.log(`Scroll attempt ${attemptCount + 1}: Previous height = ${previousHeight}, Current height = ${currentHeight}`);
    attemptCount++;
  }
}

async function qs(page, selector) {
  try {
    const element = await page.$(selector);
    if (element) return element;
    else {
      console.warn(`Element not found: ${selector}`);
      return null;
    }
  } catch (error) {
    throw error;
  }
}

async function qsAll(page, selector) {
  try {
    const elements = await page.$$(selector);
    return elements;
  } catch (error) {
    throw error;
  }
}


async function getClassName(page, className) {
  try {
    const elements = await page.$$(`.${className}`);
    if (elements.length > 0) return elements;
    else {
      console.warn(`Element not found: .${className}`);
      return null;
    }
  } catch (error) {
    throw error;
  }
}


async function click(page, selector) {
  try {
    const element = await page.$(selector);
    if (element) {
      await element.click();
    } else {
      console.warn(`Element not found: ${selector}`);
    }
  } catch (error) {
    throw error;
  }
}

async function getText(page, selector) {
  try {
    const element = await page.$(selector);
    if (element) {
      const text = await element.textContent() ?? element.innerText();
      return text.trim();
    } else {
      console.warn(`Element not found: ${selector}`);
      return null;
    }
  } catch (error) {
    throw error;
  }
}

async function getHtml(page, selector) {
    try {
      const element = await page.$(selector);
      if (element) {
          const htmlContent = await element.innerHTML();
          return htmlContent;
      } else {
          console.warn(`Element not found: ${selector}`);
          return null;
      }
    } catch (error) {
      console.error('Error getting content:', error);
      throw error;
    }
}

async function waitSelector(page, selector, options = {}) {
  try {
    const defaultOptions = { timeout: 5000, state: 'attached' }; // Default timeout 5 detik, state 'attached'
    const mergedOptions = { ...defaultOptions, ...options };
    await page.waitForSelector(selector, mergedOptions);
    return true;
  } catch (error) {
    if (error.message.includes('timeout')) {
      return false;
    }
    throw error;
  }
}


async function loadState(page, state = 'load', options = {}) {
  try {
    const defaultOptions = { timeout: 30000 }; // Increase default timeout to 30 seconds
    const mergedOptions = {...defaultOptions, ...options};
    await page.waitForLoadState(state, mergedOptions);
    return true;
  } catch (error) {
    if (error.message.includes('timeout')) {
      console.warn(`Timeout waiting for page state: ${state}. Continuing anyway.`);
      return false;
    }
    throw error;
  }
}
async function waitNetwork(page, options = {}) {
  try {
    const defaultOptions = { timeout: 5000, idleTime: 500 }; // Default timeout 5 detik, idleTime 500ms
    const mergedOptions = { ...defaultOptions, ...options };
    await page.waitForNetworkIdle(mergedOptions);
    return true;
  } catch (error) {
    if (error.message.includes('timeout')) {
      return false;
    }
    throw error;
  }
}

async function rest(min = 5000, max = 10000){
  const rand = Math.random() * (max - min) + min;
  return new Promise((r) => setTimeout(r, rand))
}

async function run() {
  const browser = await openBrowser();
  const page = await browser.newPage();
  await page.goto('https://www.example.com');

  const titleElement = await qs(page, 'title');
  console.log('Title:', titleElement ? await titleElement.textContent() : "Title not found");

  const links = await qsAll(page, 'a');
  console.log('Number of links:', links.length);

  const paragraphElements = await getClassName(page, 'paragraph');
  console.log("Number of paragraph elements:", paragraphElements ? paragraphElements.length : "Paragraph elements not found");

  await click(page, '#myButton');

  const innerText = await getText(page, '.my-class');
  console.log('Inner text:', innerText);

  const content = await getHtml(page, '#myDiv');
  console.log('Content:', content);
  
  // Contoh penggunaan waitForSelector
  await waitSelector(page, '#myElement', {timeout: 10000}); // Menunggu sampai 10 detik
  const elementText = await getText(page, '#myElement');
  console.log("Text from #myElement:", elementText);

  // Contoh penggunaan waitForLoadState
  await loadState(page, 'networkidle'); // Menunggu sampai network idle

  // Contoh penggunaan waitForNetworkIdle
  await waitNetwork(page, { idleTime: 1000 }); // Menunggu 1 detik sampai network idle


  await closeBrowser(browser);
}


export { openBrowser, closeBrowser, waitForScrollFeed, scroll, qs, qsAll, getClassName, getText, getHtml, waitSelector, waitNetwork, loadState, rest }
