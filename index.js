import * as browser from './browser.js';
const { openBrowser, closeBrowser, save, load, scroll, qs, qaAll, getClassName, getText, getHtml, waitSelector, waitNetwork, loadState } = browser;

function endPoint() {
	const url = 'https://www.google.com/maps/search'
	const find = 'kedai kopi'
	const area = ', Cikole, Sukabumi'
	const myLongLat = '@-6.8890102,106.873541,13z'
	return url + '/' + encodeURI(find) + '/' + myLongLat
}

/**
`https://www.g****e.com/maps/place/Cisaat,+Sukabumi+Regency,+West+Java/@-6.902101,106.8871728,13z/`
`https://www.g****e.com/maps/search/kedai+kopi/@-6.8890102,106.873541,13z`
**/

async function run() {
  const b = await openBrowser();
  const page = await b.newPage();
  await page.goto(endPoint());
  await loadState(page, 'networkidle');
  let feed = await page.$("[role='feed']")
  await waitNetwork(page, { idleTime: 1800 });
  await scroll(page, "[role='feed']")
  let card = await feed.$$('hfpxzc');
  card.forEach(c => {
   c.click();
  	const ov = 'div.bJzME.Hu9e2e.tTVLSc > div > div.e07Vkf.kA9KIf > div > div';
	waitSelector(page, ov, {timeout: 5000});
	const overview = page.$(ov);
	const title = overview.$("h1")?.textContent();
	const [ addr, phone, pluscode ] = overview.$$("button[data-item-id] > div > div > div.fontBodyMedium");
	console.log(title, addr, phone, pluscode)
  })

  await closeBrowser(browser);
}

run();
