import fs from 'fs';

const appJs = fs.readFileSync('C:\\Users\\USUARIO\\.gemini\\antigravity\\scratch\\thea_study\\assets\\app-B52w4wth.js', 'utf8');

// Find all .js references in app-B52w4wth.js
const matches = appJs.match(/[a-zA-Z0-9_-]+\-[a-zA-Z0-9_-]+\.js/g) || [];
const unique = [...new Set(matches)];

console.log(`Found ${unique.length} unique JS chunks referenced in app-B52w4wth.js:`);
console.log(unique.filter(name => /file|upload|study|material|create|doc/i.test(name)));
