import https from 'https';
import fs from 'fs';
import path from 'path';

const chunks = [
  'study-daDNHUzL.js',
  'SmartStudyPage-Ce50M70j.js',
  'SmartStudyPreviewPage-Bf8f5IRb.js',
  'StudyPage-CjSLTjRL.js'
];

const targetDir = 'C:\\Users\\USUARIO\\.gemini\\antigravity\\scratch\\thea_study\\assets';

async function downloadChunk(chunk) {
  return new Promise((resolve) => {
    const url = `https://www.thea.study/build/assets/${chunk}`;
    console.log(`Downloading ${url}...`);

    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://www.thea.study/login',
        'Accept': '*/*'
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        console.error(`Failed ${chunk}: status ${res.statusCode}`);
        resolve(null);
        return;
      }

      const filePath = path.join(targetDir, chunk);
      const fileStream = fs.createWriteStream(filePath);
      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`Saved ${chunk} (${fs.statSync(filePath).size} bytes)`);
        resolve(filePath);
      });
    });

    req.on('error', (err) => {
      console.error(`Error downloading ${chunk}:`, err.message);
      resolve(null);
    });
  });
}

async function main() {
  for (const c of chunks) {
    await downloadChunk(c);
  }
}

main();
