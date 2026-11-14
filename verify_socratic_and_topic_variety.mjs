import assert from 'node:assert';
import {
  normalizeTopicKey,
  isSameOrRelatedTopic,
  isTopicInRecent,
  updateSocraticProfileOnAnswer,
  resolveNextSocraticTarget,
  createInitialSocraticProfile,
} from './src/engine/socraticEngine.ts';

console.log('=== TEST SUITE: Socratic Engine & Thematic Interleaving ===');

// 1. Topic Normalization & Comparison
console.log('\n--- 1. Testing Topic Normalization & Matching ---');
const t1 = 'Sensibilizadores a la Insulina';
const t2 = 'sensibilizadores a la insulina';
const t3 = 'SENSIBILIZADORES A LA INSULINA';
const t4 = 'Sensibilizadores';
const t5 = 'Sulfonilureas y Secretagogos';
const t6 = 'Tratamiento con Biguanidas (Metformina)';
const t7 = 'Metformina Biguanidas';

assert.strictEqual(normalizeTopicKey(t1), 'sensibilizadores a la insulina');
assert.strictEqual(normalizeTopicKey(t3), 'sensibilizadores a la insulina');
assert.strictEqual(isSameOrRelatedTopic(t1, t2), true, 'Exact match case insensitive');
assert.strictEqual(isSameOrRelatedTopic(t1, t4), true, 'Substring match');
assert.strictEqual(isSameOrRelatedTopic(t1, t5), false, 'Different topics should not match');
assert.strictEqual(isSameOrRelatedTopic(t6, t7), true, 'Shared tokens (metformina + biguanidas)');

assert.strictEqual(isTopicInRecent(t1, ['sulfonilureas', 'sglt2']), false);
assert.strictEqual(isTopicInRecent(t1, ['sulfonilureas', 'sensibilizadores a la insulina']), true);
console.log('✓ Topic normalization and matching tests passed.');

// 2. Socratic Spacing for Normal Kits (>= 15 questions)
console.log('\n--- 2. Testing Socratic Spacing for Normal Kits ---');
const initialProfile = createInitialSocraticProfile('kit-123', []);
const failedQ1 = {
  id: 'q-fail-1',
  question: '¿Mecanismo de acción de la metformina?',
  topic: 'Sensibilizadores a la Insulina',
  difficulty: 'medium',
  explanation: 'Inhibe el complejo 1 mitocondrial',
};

const result1 = updateSocraticProfileOnAnswer(
  initialProfile,
  failedQ1,
  false,
  'Inhibe la ATP sintasa',
  2, // currentIndex = 2
  25 // poolSize = 25 (normal kit)
);

assert(result1.interventionScheduled, 'Intervention should be scheduled');
const sched1 = result1.interventionScheduled.scheduledAtQuestionIndex;
console.log(`Failed at index 2, scheduled at index: ${sched1} (Gap: ${sched1 - 2})`);
assert(sched1 >= 2 + 6 && sched1 <= 2 + 8, `Expected gap between 6 and 8, got ${sched1 - 2}`);
console.log('✓ Normal kit spacing (6-8 questions) verified.');

// 3. Socratic Spacing for Small Kits (< 15 questions)
console.log('\n--- 3. Testing Socratic Spacing for Small Kits ---');
const resultSmall = updateSocraticProfileOnAnswer(
  initialProfile,
  failedQ1,
  false,
  'Error answer',
  2, // currentIndex = 2
  10 // poolSize = 10 (small kit)
);
const schedSmall = resultSmall.interventionScheduled.scheduledAtQuestionIndex;
console.log(`Failed at index 2 (small kit), scheduled at index: ${schedSmall} (Gap: ${schedSmall - 2})`);
assert(schedSmall >= 2 + 4 && schedSmall <= 2 + 5, `Expected gap between 4 and 5, got ${schedSmall - 2}`);
console.log('✓ Small kit spacing (4-5 questions) verified.');

// 4. Multiple Consecutive Errors with Amortiguador (No Socratic Blasts)
console.log('\n--- 4. Testing Multi-Error Buffer / Escalonamiento con Amortiguador ---');
const failedQ2 = {
  id: 'q-fail-2',
  question: '¿Efecto adverso de la pioglitazona?',
  topic: 'Tiazolidindionas',
  difficulty: 'medium',
  explanation: 'Edema y falla cardíaca',
};

// Second failure right after at index 3
const result2 = updateSocraticProfileOnAnswer(
  result1.updatedProfile,
  failedQ2,
  false,
  'Hipoglucemia',
  3, // currentIndex = 3
  25
);

const sched2 = result2.interventionScheduled.scheduledAtQuestionIndex;
console.log(`First scheduled at ${sched1}, Second scheduled at ${sched2} (Buffer: ${sched2 - sched1})`);
assert(sched2 >= sched1 + 3, `Expected at least 3 questions buffer between scheduled interventions, got ${sched2 - sched1}`);
console.log('✓ Multi-error amortiguador verified.');

// 5. Socratic Target Resolution with excludeTopic
console.log('\n--- 5. Testing Socratic Target Resolution with excludeTopic ---');
const readyProfile = {
  ...result1.updatedProfile,
  interventions: [
    {
      ...result1.interventionScheduled,
      status: 'ready',
      scheduledAtQuestionIndex: 8,
      reformulatedQuestion: {
        id: 'socr-reform-1',
        question: 'Analizando de otro ángulo la metformina...',
        topic: 'Sensibilizadores a la Insulina',
        difficulty: 'medium',
        isSocraticReformulation: true,
      },
    },
  ],
};

// If targetIndex < 8, should be null
assert.strictEqual(resolveNextSocraticTarget(readyProfile, 7), null, 'Should not trigger before index 8');

// If targetIndex >= 8, but user just answered a question from the SAME topic, should postpone (null)
const postponed = resolveNextSocraticTarget(readyProfile, 8, 'Sensibilizadores a la Insulina');
assert.strictEqual(postponed, null, 'Should postpone if student just answered same topic');

// If targetIndex >= 8, and user answered a DIFFERENT topic (e.g. Sulfonilureas), should return intervention!
const ready = resolveNextSocraticTarget(readyProfile, 8, 'Sulfonilureas');
assert(ready, 'Should trigger when due and previous question is from a different topic');
assert.strictEqual(ready.reformulatedQuestion.id, 'socr-reform-1');
console.log('✓ Socratic target resolution and anti-immediate-repetition verified.');

// 6. Simulation of Thematic Interleaving across 10 questions
console.log('\n--- 6. Simulating Active Thematic Interleaving Loop ---');
const pool = [
  { id: 'q1', topic: 'Sensibilizadores a la Insulina', question: 'Q1 Metformina' },
  { id: 'q2', topic: 'Sensibilizadores a la Insulina', question: 'Q2 Pioglitazona' },
  { id: 'q3', topic: 'Sensibilizadores a la Insulina', question: 'Q3 Biguanidas' },
  { id: 'q4', topic: 'Sulfonilureas', question: 'Q4 Glibenclamida' },
  { id: 'q5', topic: 'Sulfonilureas', question: 'Q5 Glimepirida' },
  { id: 'q6', topic: 'Inhibidores SGLT2', question: 'Q6 Empagliflozina' },
  { id: 'q7', topic: 'Inhibidores SGLT2', question: 'Q7 Dapagliflozina' },
  { id: 'q8', topic: 'Agonistas GLP-1', question: 'Q8 Liraglutida' },
  { id: 'q9', topic: 'Insulinas', question: 'Q9 Glargina' },
  { id: 'q10', topic: 'Complicaciones Agudas', question: 'Q10 Cetoacidosis' },
];

const recentTopics = [];
const chosenSequence = [];

for (let step = 0; step < 8; step++) {
  // Sort indices giving priority to non-recent topics
  const indices = Array.from({ length: pool.length }, (_, i) => i);
  indices.sort((a, b) => {
    const aRecent = isTopicInRecent(pool[a]?.topic, recentTopics) ? 1 : 0;
    const bRecent = isTopicInRecent(pool[b]?.topic, recentTopics) ? 1 : 0;
    return aRecent - bRecent;
  });

  // Pick first available that hasn't been chosen
  const pickedIndex = indices.find(idx => !chosenSequence.includes(pool[idx].id));
  const pickedQ = pool[pickedIndex];
  chosenSequence.push(pickedQ.id);

  // Check that the picked question does NOT repeat any of the last 2 chosen topics if other topics exist
  if (recentTopics.length >= 1) {
    const lastTopic = recentTopics[recentTopics.length - 1];
    assert(
      !isSameOrRelatedTopic(pickedQ.topic, lastTopic),
      `Consecutive topic repetition detected! ${pickedQ.topic} immediately followed ${lastTopic}`
    );
  }

  recentTopics.push(normalizeTopicKey(pickedQ.topic));
  if (recentTopics.length > 3) recentTopics.shift();
  console.log(`Step ${step + 1}: Picked "${pickedQ.question}" [${pickedQ.topic}] | Recent: ${JSON.stringify(recentTopics)}`);
}

console.log('✓ Thematic interleaving loop passed with 0 back-to-back repetitions.');
console.log('\nALL 6 VERIFICATION CHECKS PASSED SUCCESSFULLY!');
