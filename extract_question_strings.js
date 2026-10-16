import fs from 'fs';

const i18n = fs.readFileSync('C:\\Users\\USUARIO\\.gemini\\antigravity\\scratch\\thea_study\\assets\\en-i18n.js', 'utf8');

// Search for question categories and types in translations
const matches = i18n.match(/"(?:smartStudy|questions|test|exam|matching|practiceTest)":\s*\[[^\]]+\]/gi) || [];
console.log('Matches:', matches.slice(0, 5));

// Search for questions patterns
const qPatterns = i18n.match(/"([^"]*?(?:match|select|drag|choose|correct|definition|which of the following)[^"]*?)"/gi) || [];
console.log('Total question-related string patterns:', qPatterns.length);
console.log('Sample strings:');
console.log(qPatterns.slice(0, 20));

fs.writeFileSync(
  'C:\\Users\\USUARIO\\.gemini\\antigravity\\scratch\\thea_question_strings.json',
  JSON.stringify(qPatterns.slice(0, 100), null, 2),
  'utf8'
);
