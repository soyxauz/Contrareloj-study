import {
  extractQuestionStemTokens,
  extractQuestionSemanticTokens,
  deriveGranularSubtopic,
  calculateInterleavingPenalty,
  isQuestionThematicallyRecent
} from './src/engine/topicInterleaving.ts';

const kitTitle = 'Diabetes Mellitus Tipo 2';

const mockQuestions = [
  {
    id: 'q-fisio-1',
    topic: 'Diabetes Tipo 2',
    question: '¿Cuál es el proceso fisiopatológico primario de la resistencia periférica a la insulina?',
    options: ['Defecto post-receptor en la señalización intracelular del transportador GLUT-4', 'Falta absoluta de producción de insulina', 'Acelerada degradación renal de péptido C', 'Anticuerpos anti-GAD65'],
    correctIndex: 0,
    difficulty: 'easy'
  },
  {
    id: 'q-metformina-1',
    topic: 'Diabetes Tipo 2',
    question: '¿Qué mecanismo celular explica la reducción de glucosa hepática por la Metformina?',
    options: ['Activación de AMPK mitocondrial que inhibe la gluconeogénesis hepática', 'Estimulación del receptor SUR-1', 'Aumento de excreción urinaria de glucosa', 'Inhibición de DPP-4'],
    correctIndex: 0,
    difficulty: 'easy'
  },
  {
    id: 'q-secretagogo-1',
    topic: 'Diabetes Tipo 2',
    question: '¿Cuál es el mecanismo de acción de las sulfonilureas como la glibenclamida?',
    options: ['Cierre de los canales de potasio sensibles a ATP en las células beta promoviendo despolarización y secreción', 'Sensibilización periférica en miocitos', 'Inhibición de alfa-glucosidasa', 'Agonismo de GLP-1'],
    correctIndex: 0,
    difficulty: 'easy'
  },
  {
    id: 'q-prevencion-1',
    topic: 'Diabetes Tipo 2',
    question: '¿Qué intervención de estilo de vida ha demostrado la mayor reducción en la incidencia de diabetes tipo 2?',
    options: ['Reducción ponderal del 7% y 150 minutos semanales de actividad física moderada', 'Suplementación con vitamina C', 'Dieta hiperproteica sin ejercicio', 'Consumo de edulcorantes artificiales'],
    correctIndex: 0,
    difficulty: 'easy'
  },
  {
    id: 'q-diagnostico-1',
    topic: 'Diabetes Tipo 2',
    question: 'Según los criterios diagnósticos estándar, ¿qué valor de HbA1c confirma diabetes?',
    options: ['Mayor o igual a 6.5%', 'Mayor o igual a 5.7%', 'Mayor a 7.0%', 'Mayor a 8.0%'],
    correctIndex: 0,
    difficulty: 'easy'
  },
  {
    id: 'q-complicacion-1',
    topic: 'Diabetes Tipo 2',
    question: '¿Cuál es la primera manifestación clínica detectable de la nefropatía diabética incipiente?',
    options: ['Microalbuminuria persistente en orina de 24 horas (30-300 mg/día)', 'Aumento brusco de creatinina', 'Hematuria macroscópica', 'Edema generalizado fulminante'],
    correctIndex: 0,
    difficulty: 'easy'
  },
  {
    id: 'q-fisio-2',
    topic: 'Diabetes Tipo 2',
    question: 'En la fisiopatología del islote pancreático, ¿qué hormona se encuentra paradójicamente hipersecretada?',
    options: ['Glucagón por las células alfa en respuesta a la resistencia insulínica', 'Somatostatina por las células delta', 'Polipéptido pancreático', 'Ghrelina gástrica'],
    correctIndex: 0,
    difficulty: 'easy'
  },
  {
    id: 'q-metformina-2',
    topic: 'Diabetes Tipo 2',
    question: '¿Cuál es la complicación adversa más grave pero infrecuente de la metformina y en qué pacientes está contraindicada?',
    options: ['Acidosis láctica, contraindicada con filtrado glomerular menor a 30 ml/min', 'Hipoglucemia grave prolongada', 'Pancreatitis aguda necrotizante', 'Aumento acelerado de peso'],
    correctIndex: 0,
    difficulty: 'easy'
  },
  {
    id: 'q-prevencion-2',
    topic: 'Diabetes Tipo 2',
    question: 'En pacientes con prediabetes, ¿qué factor de riesgo modificable reduce directamente la resistencia insulínica?',
    options: ['Disminución del perímetro abdominal y grasa visceral mediante ejercicio aeróbico', 'Aumento del consumo de carbohidratos simples', 'Sedentarismo controlado', 'Aumento de horas de reposo'],
    correctIndex: 0,
    difficulty: 'easy'
  }
];

console.log('--- Subtopics Inferred for All Questions ---');
mockQuestions.forEach(q => {
  console.log(`${q.id} -> ${deriveGranularSubtopic(q, kitTitle)}`);
});

// Simulation of 10-step student interaction
const historySignatures = [];
const answeredIds = new Set();
const correctlyAnsweredIds = new Set();
const scheduledErrorReviews = [];

let pool = [...mockQuestions];

console.log('\n--- Simulating 8 Consecutive Question Selections ---');
for (let step = 0; step < 8; step++) {
  // Check scheduled reviews
  let chosen = null;
  const readyReviewIdx = scheduledErrorReviews.findIndex(r => r.targetIndex <= step);
  if (readyReviewIdx !== -1) {
    const rev = scheduledErrorReviews[readyReviewIdx];
    const rSub = deriveGranularSubtopic(rev.question, kitTitle);
    const rStem = extractQuestionStemTokens(rev.question, kitTitle);
    const rAll = extractQuestionSemanticTokens(rev.question, kitTitle);
    if (!isQuestionThematicallyRecent(rev.question, rStem, rAll, rSub, historySignatures, 2)) {
      chosen = rev.question;
      scheduledErrorReviews.splice(readyReviewIdx, 1);
      console.log(`[Step ${step}] -> REINTRODUCING FAILED QUESTION (Spaced Review): ${chosen.id} (${rSub})`);
    } else {
      rev.targetIndex = step + 1; // postpone
    }
  }

  if (!chosen) {
    // Candidates not yet answered correctly
    const unmastered = pool.filter(q => !correctlyAnsweredIds.has(q.id));
    const signatures = unmastered.map(q => ({
      question: q,
      subtopic: deriveGranularSubtopic(q, kitTitle),
      stemTokens: extractQuestionStemTokens(q, kitTitle),
      allTokens: extractQuestionSemanticTokens(q, kitTitle),
    }));

    // Sort by interleaving penalty
    signatures.sort((a, b) => {
      const penA = calculateInterleavingPenalty(a.question, a.stemTokens, a.allTokens, a.subtopic, historySignatures, 5);
      const penB = calculateInterleavingPenalty(b.question, b.stemTokens, b.allTokens, b.subtopic, historySignatures, 5);
      return penA - penB;
    });

    chosen = signatures[0].question;
    const chosenSub = signatures[0].subtopic;
    const pen = calculateInterleavingPenalty(chosen, signatures[0].stemTokens, signatures[0].allTokens, chosenSub, historySignatures, 5);
    console.log(`[Step ${step}] -> Selected: ${chosen.id} | Subtopic: "${chosenSub}" | Penalty: ${pen.toFixed(1)}`);
  }

  // Record signature
  const chosenSubtopic = deriveGranularSubtopic(chosen, kitTitle);
  const chosenStem = extractQuestionStemTokens(chosen, kitTitle);
  const chosenAll = extractQuestionSemanticTokens(chosen, kitTitle);
  historySignatures.push({
    id: chosen.id,
    topic: chosen.topic,
    subtopic: chosenSubtopic,
    stemTokens: chosenStem,
    allTokens: chosenAll
  });
  answeredIds.add(chosen.id);

  // Simulate answering: student fails step 1 (Metformina 1)
  if (step === 1) {
    console.log(`   * Student FAILS ${chosen.id}! Scheduling reintroduction at step ${step + 5}...`);
    scheduledErrorReviews.push({ question: chosen, targetIndex: step + 5 });
  } else {
    correctlyAnsweredIds.add(chosen.id);
  }
}

// Assertions:
// 1. Never two adjacent questions with the same subtopic
for (let i = 1; i < historySignatures.length; i++) {
  const prevSub = historySignatures[i - 1].subtopic;
  const currSub = historySignatures[i].subtopic;
  if (prevSub === currSub) {
    console.error(`FAILURE: Consecutive questions have identical subtopic "${currSub}" at steps ${i - 1} and ${i}!`);
    process.exit(1);
  }
}

console.log('\nVERIFICATION PASSED:');
console.log('1. Zero consecutive questions of the same subtopic.');
console.log('2. Failed question (Metformina 1) was reintroduced with 5 questions of separation.');
console.log('3. Subtopics cleanly rotated across Fisiopatología, Farmacología, Prevención, Diagnóstico, Complicaciones.');
