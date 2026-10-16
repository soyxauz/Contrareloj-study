import fs from 'fs';

const studyJs = fs.readFileSync('C:\\Users\\USUARIO\\.gemini\\antigravity\\scratch\\thea_study\\assets\\study-daDNHUzL.js', 'utf8');
const smartStudyPageJs = fs.readFileSync('C:\\Users\\USUARIO\\.gemini\\antigravity\\scratch\\thea_study\\assets\\SmartStudyPage-Ce50M70j.js', 'utf8');

console.log('Analyzing Question Types and SmartStudy internals...');

// Search for question type enums or definitions
const typeMatches = studyJs.match(/(?:QuestionType|questionType|QUESTION_TYPE)[^;{}]{1,100}/g) || [];
console.log('QuestionType matches:', typeMatches);

// Search for enums with values like "MultipleChoice", "Matching", "Drag", "Select", "FillInTheBlank", etc.
const enumMatches = studyJs.match(/([a-zA-Z0-9_$]+)\s*=\s*\([^)]*\)\s*=>\s*\{[^}]*MultipleChoice[^}]*\}/g) || [];
console.log('Enum matches:', enumMatches);

// Search for question rendering components
const compMatches = smartStudyPageJs.match(/[a-zA-Z0-9_$]+Question[a-zA-Z0-9_$]*/g) || [];
console.log('Question components in SmartStudyPage:', [...new Set(compMatches)]);

// Search for question properties (e.g. prompt, options, answers, pairs)
const matches2 = studyJs.match(/.{0,50}(?:matching|drag|dropdown|multiSelect|singleSelect|multipleResponse|reorder).{0,50}/gi) || [];
console.log('Question interaction keywords samples (first 10):', matches2.slice(0, 10));

fs.writeFileSync(
  'C:\\Users\\USUARIO\\.gemini\\antigravity\\scratch\\smart_study_analysis.json',
  JSON.stringify({
    typeMatches,
    enumMatches,
    compMatches: [...new Set(compMatches)],
    matches2: matches2.slice(0, 30)
  }, null, 2)
);
