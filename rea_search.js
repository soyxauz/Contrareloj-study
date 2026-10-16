import fs from 'fs';
import path from 'path';

const assetsDir = 'C:\\Users\\USUARIO\\.gemini\\antigravity\\scratch\\thea_study\\assets';
const files = fs.readdirSync(assetsDir);

console.log('Searching in bundles...');

const searchPatterns = [
  /create[_-]?study[_-]?set/i,
  /upload/i,
  /document/i,
  /file[_-]?upload/i,
  /study[_-]?kit/i,
  /source/i,
  /process[_-]?content/i,
  /youtube/i,
  /transcript/i,
  /\/api\//i,
  /generate/i,
  /formData/i
];

const results = {};

for (const f of files) {
  if (!f.endsWith('.js')) continue;
  const content = fs.readFileSync(path.join(assetsDir, f), 'utf8');

  for (const pattern of searchPatterns) {
    const matches = content.match(new RegExp(`.{0,60}${pattern.source}.{0,60}`, 'gi'));
    if (matches && matches.length > 0) {
      if (!results[pattern.source]) results[pattern.source] = [];
      results[pattern.source].push({
        file: f,
        count: matches.length,
        samples: matches.slice(0, 5)
      });
    }
  }
}

fs.writeFileSync(
  'C:\\Users\\USUARIO\\.gemini\\antigravity\\scratch\\rea_search_results.json',
  JSON.stringify(results, null, 2),
  'utf8'
);

console.log('Search finished. Results saved to rea_search_results.json');
