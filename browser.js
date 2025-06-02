import chromium from "@sparticuz/chromium";
import playwright from "playwright-core";

const executablePath = await chromium.executablePath()

async function openBrowser(options = {}) {
  try {
    const browser = await playwright.chromium.launch({
    	executablePath,
      headless: options.headless ?? true, // Default headless: true
      args: options.args ?? chromium.args ?? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage','--disable-accelerated-2d-canvas'],
      slowMo: options.slowMo ?? 0 // Slow motion untuk debugging (ms)
    });
    return browser;
  } catch (error) {
    console.error('Error launching browser:', error);
    throw error; 
  }
}

async function closeBrowser(browser) {
  try {
    await browser.close();
    console.log('Browser closed.');
  } catch (error) {
    console.error('Error closing browser:', error);
    throw error;
  }
}

async function scroll(page, selector) {
  try {
    await page.waitForSelector(selector, { timeout: 5000, state: 'attached' });
    await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      if (element) {
        element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
      } else {
        console.warn('Element not found:', selector);
      }
    }, selector);
  } catch (error) {
    throw error;
  }
}

async function save(data, filePath) {
  try {
    const fs = require('node:fs/promises'); // Gunakan fs/promises untuk async operation
    const jsonData = JSON.stringify(data, null, 2); // Gunakan null, 2 untuk format yang lebih mudah dibaca
    await fs.writeFile(filePath, jsonData);
    console.log(`Data saved to ${filePath}`);
  } catch (error) {
    console.error('Error saving data to JSON:', error);
    throw error;
  }
}

async function load(filePath) {
  try {
    const fs = require('node:fs/promises');
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading data from JSON:', error);
    if (error.code === 'ENOENT') {
      console.error(`File ${filePath} not found`);
      return null;
    }
    throw error;
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
        const defaultOptions = { timeout: 5000 };
        const mergedOptions = {...defaultOptions, ...options};
        await page.waitForLoadState(state, mergedOptions);
        return true;
    } catch (error) {
        if (error.message.includes('timeout')) {
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
  const elementText = await getInnerText(page, '#myElement');
  console.log("Text from #myElement:", elementText);

  // Contoh penggunaan waitForLoadState
  await loadState(page, 'networkidle'); // Menunggu sampai network idle

  // Contoh penggunaan waitForNetworkIdle
  await waitNetwor(page, { idleTime: 1000 }); // Menunggu 1 detik sampai network idle


  await closeBrowser(browser);
}


export { openBrowser, closeBrowser, save, load, scroll, qs, qsAll, getClassName, getText, getHtml, waitSelector, waitNetwork, loadState }

