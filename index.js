import * as browser from './browser.js';
const { openBrowser, closeBrowser, waitForScrollFeed, save, load, scroll, qs, qsAll, getClassName, getText, getHtml, waitSelector, waitNetwork, loadState, rest } = browser;

function endPoint() {
	const url = 'https://www.google.com/maps/search'
	const find = 'kedai kopi'
	const area = ', Cikole, Sukabumi'
	const myLongLat = '@-6.8890102,106.873541,13z'
	return url + '/' + encodeURI(find) + '/' + myLongLat
}

/**
`https://www.google.com/maps/place/Cisaat,+Sukabumi+Regency,+West+Java/@-6.902101,106.8871728,13z/`
`https://www.google.com/maps/search/kedai+kopi/@-6.8890102,106.873541,13z`
**/

async function run() {
  const ob = await openBrowser();
  const ctx = ob.newContext();
  const page = await ob.newPage();
  await page.goto(endPoint());
  // await loadState(page, 'networkidle');
  let feed = await page.$("[role='feed']")
  // await waitNetwork(page, { idleTime: 1800 });
  await waitForScrollFeed(page, 8);
  let card = await feed.$$('.hfpxzc');
  const processedTitles = new Set();
  const results = [];
  
  // Process cards one by one with proper async handling
  for (const c of card) {
    try {
      await c.click(); await rest(6000,9000);
      const ov = 'div.bJzME.Hu9e2e.tTVLSc > div > div.e07Vkf.kA9KIf > div > div';
      await waitSelector(page, ov, {timeout: 5000});
      const overview = await page.$(ov);
      
      if (overview) {
        const titleElement = await overview.$("h1");
        const title = titleElement ? await titleElement.textContent() : "No title";
        
        // Skip jika title sudah ada
        if (processedTitles.has(title)) continue;
        processedTitles.add(title);
  
	const ie = await overview.$$("button[data-item-id]");
        const infoElements = await overview.$$("button[data-item-id] > div > div > div.fontBodyMedium");
	const alamat = ie[0].ariaLabel.split(":")[1].trim()
	const kontak = [...ie].find(d=>d.dataset.itemId.includes(":")).dataset.itemId.split(":")[2];
        const addr = alamat.length > 0 ? await alamat : "No address";
        const phone = kontak.length > 0 ? await alamat : "No phone";
        const pluscode = infoElements.length > 0 ? await infoElements[2].textContent() : "No code";
        
        // Simpan ke array results
        results.push({ title, addr, phone, pluscode });
        console.log(`Processed: ${title}`);
      }
    } catch (error) {
      console.error("Error processing card:", error);
    }
  }
  console.log('\nHasil Akhir:');
  results.forEach((item, index) => {
    console.log(`\n${index + 1}. ${item.title}`);
    console.log(`   Alamat: ${item.addr}`);
    console.log(`   Telepon: ${item.phone}`);
    console.log(`   Plus Code: ${item.pluscode}`);
  }); 
  await closeBrowser(ob);
}

run();
