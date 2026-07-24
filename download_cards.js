const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL = 'https://www.deckofcardsapi.com/static/img';

// 54 cards per deck
const suits = [
  { key: 'S', name: 'spades' },
  { key: 'H', name: 'hearts' },
  { key: 'C', name: 'clubs' },
  { key: 'D', name: 'diamonds' },
];

const ranks = [
  { key: 'A', name: 'ace' },
  { key: '2', name: '2' },
  { key: '3', name: '3' },
  { key: '4', name: '4' },
  { key: '5', name: '5' },
  { key: '6', name: '6' },
  { key: '7', name: '7' },
  { key: '8', name: '8' },
  { key: '9', name: '9' },
  { key: '0', name: '10' },
  { key: 'J', name: 'jack' },
  { key: 'Q', name: 'queen' },
  { key: 'K', name: 'king' },
];

const jokers = [
  { key: 'X1', name: 'joker1' },
  { key: 'X2', name: 'joker2' },
];

// Build all 54 card codes for one deck
function buildDeckCodes() {
  const codes = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      codes.push({ code: rank.key + suit.key, name: `${rank.name}_of_${suit.name}` });
    }
  }
  for (const joker of jokers) {
    codes.push({ code: joker.key, name: joker.name });
  }
  return codes;
}

function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        https.get(response.headers.location, (res) => {
          res.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
        }).on('error', reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function main() {
  const baseDir = path.join(__dirname, 'cards');
  ensureDir(baseDir);

  const deck1Dir = path.join(baseDir, 'deck1');
  const deck2Dir = path.join(baseDir, 'deck2');
  ensureDir(deck1Dir);
  ensureDir(deck2Dir);

  const deckCodes = buildDeckCodes();
  const total = deckCodes.length * 2 + 1; // 2 decks + back
  let downloaded = 0;

  console.log(`开始下载 ${total} 张图片 (108张牌面 + 1张牌背)...\n`);

  // Download deck 1 faces
  for (let i = 0; i < deckCodes.length; i++) {
    const { code, name } = deckCodes[i];
    const url = `${BASE_URL}/${code}.png`;
    const filePath = path.join(deck1Dir, `${name}.png`);
    try {
      await downloadFile(url, filePath);
      downloaded++;
      process.stdout.write(`\r[${downloaded}/${total}] 第1副牌: ${name}.png`);
    } catch (e) {
      console.error(`\n下载失败: ${url} - ${e.message}`);
    }
  }

  // Download deck 2 faces
  for (let i = 0; i < deckCodes.length; i++) {
    const { code, name } = deckCodes[i];
    const url = `${BASE_URL}/${code}.png`;
    const filePath = path.join(deck2Dir, `${name}.png`);
    try {
      await downloadFile(url, filePath);
      downloaded++;
      process.stdout.write(`\r[${downloaded}/${total}] 第2副牌: ${name}.png`);
    } catch (e) {
      console.error(`\n下载失败: ${url} - ${e.message}`);
    }
  }

  // Download card back
  const backUrl = `${BASE_URL}/back.png`;
  const backPath = path.join(baseDir, 'back.png');
  try {
    await downloadFile(backUrl, backPath);
    downloaded++;
    process.stdout.write(`\r[${downloaded}/${total}] 牌背: back.png`);
  } catch (e) {
    console.error(`\n下载失败: ${backUrl} - ${e.message}`);
  }

  console.log('\n\n✅ 下载完成！');
  console.log(`📁 文件保存在: ${baseDir}`);
  console.log(`   - deck1/   : 第1副牌 (54张)`);
  console.log(`   - deck2/   : 第2副牌 (54张)`);
  console.log(`   - back.png : 牌背`);
}

main().catch(console.error);
