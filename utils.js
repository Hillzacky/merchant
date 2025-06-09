import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webpath =(df)=> path.join(__dirname, df);

function parseCSV(filePath) {
  const data = fs.readFileSync(filePath, 'utf-8');
  const lines = data.split(/\r\n|\r|\n/).filter(line => line.trim() !== '');
  const result = [];

  for (const line of lines) {
    const values = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
    if (values) {
        result.push(values.map(value => value.trim().replace(/^"|"$/g, '')));
    }
  }
  return result;
}

function getPosition(filePath) {
  const lines = parseCSV(filePath);
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    result.push({
      myLongLat: line[0].trim(),
      area: line[1] ? line[1].trim() : ''
    });
  }
  return result;
}

// Contoh penggunaan:
// const dataList = getPosition(path.join(__dirname, 'data.csv'));
// for (const { myLongLat, area } of dataList) {
//   // lakukan sesuatu dengan myLongLat dan area, misal panggil endPoint dengan parameter tersebut
// }


async function save(data) {
  try {
    const timestamp = new Date().toISOString().replace(/[-:Z]/g, '');
    const filePath = path.join(__dirname + '/storage', `${timestamp}.json`);
    const jsonData = JSON.stringify(data, null, 2); // Gunakan null, 2 untuk format yang lebih mudah dibaca
    await fs.promises.writeFile(filePath, jsonData);
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

async function saveAsCsv(data) {
  const timestamp = new Date().toISOString().replace(/[-:Z]/g, '');
  const filePath = path.join(__dirname + '/storage', `${timestamp}.csv`);
  const esc = (str) => `"${String(str ?? '').replace(/"/g, '""')}"`;
  const csvContent = data.map(item => [
    esc(item.title),
    esc(item.addr),
    esc(item.phone)
  ].join(',')).join('\n');
  await fs.promises.writeFile(filePath, csvContent);
}

export { getPosition, saveAsCsv, save, load, webpath };