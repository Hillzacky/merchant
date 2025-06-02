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
    const isMac = process.platform === 'darwin';
    
    let browser;
    const executablePath = await chromium.executablePath();
    console.log(`Using Chrome executable path: ${executablePath}`);
    
    const originalExecutablePath = executablePath;
    
    // Different launch strategies for macOS and other platforms
    let launchOptions; 
    if (isMac) {
      // On macOS, start with system Chrome for best stability
      launchOptions = {
        channel: 'chrome', // Try to use system Chrome first
        headless: options.headless ?? true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox'
        ],
        ignoreDefaultArgs: false
        // Note: removed userDataDir - will be handled separately
      };
      
      console.log('Using system Chrome as first launch option on macOS');
    } else {
      // On other platforms, use the downloaded chromium
      launchOptions = {
        executablePath,
        headless: options.headless ?? true,
        args: options.args ?? chromium.args ?? [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-accelerated-2d-canvas',
          '--disable-dev-shm-usage',
          '--disable-features=site-per-process'
        ],
        ignoreDefaultArgs: false
        // Note: removed userDataDir - will be handled separately
      };
    }
    
    // Add macOS specific configurations for user data directory and temp files
    if (isMac) {
      
      // Set a macOS-friendly temporary directory for user data using system temp dir
      // Use a subdirectory in the system temp directory which has appropriate permissions
      const systemTmpDir = os.tmpdir();
      const uniqueSubdir = `playwright_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      let tempDir = path.join(systemTmpDir, uniqueSubdir);
      
      
      // Create directory with proper permissions (0755)
      try {
        // Ensure the directory exists with proper permissions
        fsSync.mkdirSync(tempDir, { recursive: true, mode: 0o755 });
        
        // Verify directory was created successfully
        const stats = fsSync.statSync(tempDir);
        console.log(`Created user data directory: ${tempDir} (permissions: ${stats.mode.toString(8)})`);
        
        // Ensure we have write permissions
        const testFile = path.join(tempDir, '.test_write_access');
        fsSync.writeFileSync(testFile, 'test', { encoding: 'utf8' });
        fsSync.unlinkSync(testFile);
        console.log('Verified write permissions to temporary directory');
      } catch (err) {
        console.error(`Error setting up temporary directory: ${err.message}`);
        
        if (err.code === 'EACCES') {
          console.error('Permission denied. Trying alternative directory...');
          // Try an alternative location if permission denied
          const altTempDir = path.join(systemTmpDir, 'playwright_user_data_' + Math.random().toString(36).substring(2, 10));
          try {
            fsSync.mkdirSync(altTempDir, { recursive: true, mode: 0o755 });
            console.log(`Using alternative temporary directory: ${altTempDir}`);
            tempDir = altTempDir;
          } catch (altErr) {
            console.error(`Failed to create alternative directory: ${altErr.message}`);
          }
        }
      }
      
      // Store the user data directory for context creation later
      // Store the user data directory for context creation later
      // Note: Not adding to launchOptions since it's not supported
      tempDirectories.push(tempDir); // Track for cleanup
      console.log(`Set userDataDir to: ${tempDir}`);
      
      // Add more macOS specific options for better stability
      launchOptions.args.push(
        '--disable-renderer-backgrounding', // Prevent background throttling
        '--disable-backgrounding-occluded-windows',
        '--disable-ipc-flooding-protection',
        '--disable-hang-monitor',
        '--window-size=1280,720' // Use a reasonable window size
      );
      
      // Set product to ensure we can use system Chrome if needed
    }
    
    // Launch attempt sequence
    // Launch attempt sequence
    console.log('Attempting to launch browser with options:', JSON.stringify(launchOptions, null, 2));
    
    try {
      if (isMac && tempDir) {
        // For macOS, try with minimal options first to avoid process creation issues
        const minimalOptions = {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox'
          ],
          ignoreDefaultArgs: ['--enable-automation'],
          timeout: 30000 // Extended timeout
        };
        
        console.log('Trying macOS launch with minimal options first');
        
        try {
          // First try persistent context with minimal options
          const context = await playwright.chromium.launchPersistentContext(tempDir, minimalOptions);
          browser = context.browser();
          console.log('Browser launched successfully with persistent context and minimal options');
        } catch (err) {
          console.log('Persistent context launch failed:', err.message);
          
          // If we get the specific error, try with regular launch
          if (err.message.includes('system error -8') || err.message.includes('userDataDir option is not supported')) {
            console.log('Detected process creation or userDataDir error, trying regular launch...');
            
            // Remove userDataDir from options
            const regularOptions = {...minimalOptions, channel: 'chrome'};
            browser = await playwright.chromium.launch(regularOptions);
            console.log('Browser launched successfully with regular launch after persistent context failed');
          } else {
            // For other errors, try the original options
            const context = await playwright.chromium.launchPersistentContext(tempDir, launchOptions);
            browser = context.browser();
            console.log('Browser launched successfully with persistent context using original options');
          }
        }
      } else {
        // For other platforms or if no tempDir, use regular launch
        browser = await playwright.chromium.launch(launchOptions);
        console.log('Browser launched successfully with primary configuration');
      }
    } catch (primaryError) {
        if (isMac) {
          console.error('Primary launch failed on macOS:', primaryError.message);
          
          // Check if the error is related to process creation
          const isProcessError = primaryError.message.includes('system error -8') || 
                                primaryError.message.includes('spawn') || 
                                primaryError.message.includes('process');
          
          if (isProcessError) {
            console.log('Process creation error detected, trying alternative approach...');
            
            // Attempt: Try system Chrome with minimal settings
            const systemOptions = {
              channel: 'chrome',
              headless: true,
              args: ['--no-sandbox'],
              ignoreAllDefaultArgs: true,
              timeout: 30000
            };
            
            try {
              console.log('Trying system Chrome with minimal settings:', JSON.stringify(systemOptions, null, 2));
              browser = await playwright.chromium.launch(systemOptions);
              console.log('Browser launched successfully with system Chrome and minimal settings');
            } catch (systemError) {
              console.error('System Chrome launch failed:', systemError.message);
              throw systemError;
            }
          } else {
            // Attempt 2: Try with downloaded Chromium if on macOS 
            console.log('Trying with downloaded Chromium browser...');
            const secondAttemptOptions = {
              headless: true,
              args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
              ],
              executablePath: originalExecutablePath
            };
            
            try {
              console.log('Attempt 2 options:', JSON.stringify(secondAttemptOptions, null, 2));
              // Try with regular launch first
              browser = await playwright.chromium.launch(secondAttemptOptions);
              console.log('Browser launched successfully with downloaded Chromium');
            } catch (secondError) {
              console.error('Second launch attempt failed:', secondError.message);
              
              // Attempt 3: Minimal options as last resort
              console.log('Trying with absolute minimal options...');
              const lastResortOptions = {
                headless: true,
                args: ['--no-sandbox'],
                timeout: 30000, // Extended timeout
                ignoreDefaultArgs: ['--disable-dev-shm-usage']
              };
              
              console.log('Last resort options:', JSON.stringify(lastResortOptions, null, 2));
              try {
                browser = await playwright.chromium.launch(lastResortOptions);
                console.log('Browser launched successfully with minimal options');
              } catch (finalError) {
                console.error('All launch attempts failed on macOS.');
                console.error('Final error:', finalError.message);
                throw new Error(`Unable to launch browser on macOS after multiple attempts: ${finalError.message}`);
              }
            }
          }
        } else {
          // Not on macOS, re-throw the error
          console.error('Browser launch failed on non-macOS platform:', primaryError.message);
          throw primaryError;
        }
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
    await page.waitForTimeout(2000 * (attemptCount + 1 / 2));
    
    // Dapatkan tinggi baru
    currentHeight = await page.evaluate(() => {
      const feed = document.querySelector("[role='feed']");
      return feed ? feed.scrollHeight : 0;
    });
    
    console.log(`Scroll attempt ${attemptCount + 1}: Previous height = ${previousHeight}, Current height = ${currentHeight}`);
    attemptCount++;
  }
}

async function save(data, filePath) {
  try {
    // Use the imported fs module instead of require
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
    // Use the imported fs module instead of require
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


export { openBrowser, closeBrowser, waitForScrollFeed, save, load, scroll, qs, qsAll, getClassName, getText, getHtml, waitSelector, waitNetwork, loadState }
