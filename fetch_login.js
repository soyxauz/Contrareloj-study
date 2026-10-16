import https from 'https';
import fs from 'fs';

https.get('https://www.thea.study/login', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  }
}, (res) => {
  let html = '';
  res.on('data', chunk => html += chunk);
  res.on('end', () => {
    fs.writeFileSync('C:\\Users\\USUARIO\\.gemini\\antigravity\\scratch\\thea_study_login.html', html, 'utf8');
    console.log(`Saved login.html (${html.length} chars)`);
    // Find script tags
    const scripts = html.match(/src="[^"]+"/g);
    console.log('Scripts:', scripts);
    // Find Inertia page data
    const inertiaMatch = html.match(/data-page="([^"]+)"/);
    if (inertiaMatch) {
      console.log('Found data-page!');
    }
  });
});
