import {
  extractQuestionStemTokens,
  extractQuestionSemanticTokens,
  deriveGranularSubtopic,
  calculateInterleavingPenalty
} from './src/engine/topicInterleaving.ts';

const kitTitle = 'Diabetes Mellitus Tipo 2';

// 4 realistic questions from the user's kit
const qFisiopatologia1 = {
  id: 'q1',
  topic: 'Diabetes Tipo 2', // Flat generic topic
  question: '¿Cuál es el proceso fisiopatológico principal que explica la hiperglucemia de este paciente?',
  options: [
    'Hipersecreción de glucagón por los islotes alfa que inhibe la captación de glucosa',
    'Resistencia periférica a la insulina con aumento compensatorio de la secreción pancreática',
    'Destrucción autoinmune de las células beta pancreáticas con deficiencia absoluta',
    'Defecto genético del receptor de insulina que impide su unión en los tejidos'
  ],
  correctIndex: 1,
  explanation: 'La hiperglucemia en la diabetes tipo 2 se debe a la resistencia periférica a la insulina combinada con disfunción de células beta.'
};

const qPrevencion = {
  id: 'q2',
  topic: 'Diabetes Tipo 2', // Flat generic topic
  question: 'Selecciona las afirmaciones correctas sobre la prevención y factores de riesgo de la diabetes tipo 2:',
  options: [
    'La pérdida de peso de 5-7% y actividad física moderada reduce la incidencia en prediabetes',
    'El sedentarismo y la dieta hipercalórica son factores modificables clave',
    'El tabaquismo activo no influye en la resistencia a la insulina',
    'La edad mayor a 45 años es un factor de riesgo no modificable'
  ],
  correctIndex: 0,
  explanation: 'Las modificaciones del estilo de vida y control de factores de riesgo previenen la progresión a diabetes.'
};

const qFarmacosMetformina = {
  id: 'q3',
  topic: 'Diabetes Tipo 2', // Flat generic topic
  question: '¿Cuál es el mecanismo de acción primordial de la Metformina (Biguanida)?',
  options: [
    'Inhibición del complejo I mitocondrial que activa AMPK y disminuye la gluconeogénesis hepática',
    'Cierre de canales de potasio sensibles a ATP en las células beta aumentando la secreción de insulina',
    'Agonismo del receptor nuclear PPAR-gamma promoviendo la captación muscular de glucosa',
    'Inhibición del cotransportador SGLT-2 en el túbulo contorneado proximal renal'
  ],
  correctIndex: 0,
  explanation: 'La metformina activa AMPK reduciendo la producción hepática de glucosa.'
};

const qFisiopatologia2 = {
  id: 'q4',
  topic: 'Diabetes Tipo 2', // Flat generic topic
  question: 'En la patogénesis de la diabetes tipo 2, ¿qué alteración celular precede a la falla celular beta?',
  options: [
    'Resistencia a la insulina en tejido adiposo y muscular con hiperinsulinemia compensadora',
    'Agotamiento secretor fulminante de insulina sin resistencia previa',
    'Aclaramiento hepático acelerado de insulina',
    'Aumento de la excreción urinaria de glucosa'
  ],
  correctIndex: 0,
  explanation: 'La resistencia a la insulina precede por años al agotamiento de las células beta.'
};

const sub1 = deriveGranularSubtopic(qFisiopatologia1, kitTitle);
const sub2 = deriveGranularSubtopic(qPrevencion, kitTitle);
const sub3 = deriveGranularSubtopic(qFarmacosMetformina, kitTitle);
const sub4 = deriveGranularSubtopic(qFisiopatologia2, kitTitle);

console.log('--- Test 1: Subtopic Derivation ---');
console.log('Q1 Subtopic:', sub1);
console.log('Q2 Subtopic:', sub2);
console.log('Q3 Subtopic:', sub3);
console.log('Q4 Subtopic:', sub4);

const stem1 = extractQuestionStemTokens(qFisiopatologia1, kitTitle);
const stem2 = extractQuestionStemTokens(qPrevencion, kitTitle);
const stem3 = extractQuestionStemTokens(qFarmacosMetformina, kitTitle);
const stem4 = extractQuestionStemTokens(qFisiopatologia2, kitTitle);

const all1 = extractQuestionSemanticTokens(qFisiopatologia1, kitTitle);
const all2 = extractQuestionSemanticTokens(qPrevencion, kitTitle);
const all3 = extractQuestionSemanticTokens(qFarmacosMetformina, kitTitle);
const all4 = extractQuestionSemanticTokens(qFisiopatologia2, kitTitle);

console.log('\n--- Test 2: Stem Tokens ---');
console.log('Stem Q1:', Array.from(stem1));
console.log('Stem Q2:', Array.from(stem2));
console.log('Stem Q3:', Array.from(stem3));
console.log('Stem Q4:', Array.from(stem4));

// History: Student just answered Q1 (Fisiopatología 1)
const recentHistory = [
  {
    id: qFisiopatologia1.id,
    topic: qFisiopatologia1.topic,
    subtopic: sub1,
    stemTokens: stem1,
    allTokens: all1
  }
];

const penaltyQ2 = calculateInterleavingPenalty(qPrevencion, stem2, all2, sub2, recentHistory, 5);
const penaltyQ3 = calculateInterleavingPenalty(qFarmacosMetformina, stem3, all3, sub3, recentHistory, 5);
const penaltyQ4 = calculateInterleavingPenalty(qFisiopatologia2, stem4, all4, sub4, recentHistory, 5);

console.log(`\nPenalty for Q2 (Prevención): ${penaltyQ2.toFixed(2)}`);
console.log(`Penalty for Q3 (Metformina): ${penaltyQ3.toFixed(2)}`);
console.log(`Penalty for Q4 (Fisiopatología 2): ${penaltyQ4.toFixed(2)}`);

if (penaltyQ4 > penaltyQ2 && penaltyQ4 > penaltyQ3 && penaltyQ2 < 5 && penaltyQ3 < 5 && penaltyQ4 >= 25) {
  console.log('\nSUCCESS! Q4 (same subtopic/concept) has heavy penalty (>= 25), while Q2 & Q3 (different subtopics) have near-zero penalty (< 5)!');
  console.log('This guarantees that after Q1, Q2 or Q3 will be selected next, perfectly interleaving different subtopics!');
} else {
  console.error('\nFAILURE in interleaving scoring constraints');
  process.exit(1);
}
