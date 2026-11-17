const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  ModelArtifactError,
  classifyText,
  hasIndependentCategoryAssessment,
  loadModel
} = require('../utils/experimentalCategoryModel');

function makeModel() {
  return {
    schemaVersion: 1,
    model: 'LinearSVC',
    modelVersion: 'test-version',
    trainingDataStatus: 'synthetic_only',
    realWorldPerformanceClaim: false,
    categories: ['Bribery', 'Other'],
    features: {
      word: {
        vocabulary: { bribe: 0 },
        idf: [1],
        ngramRange: [1, 1]
      },
      char: {
        vocabulary: { ' br': 0 },
        idf: [1],
        ngramRange: [3, 3]
      }
    },
    weights: [[2, 1], [0, 0]],
    intercepts: [0, 0]
  };
}

test('scores exported word and character features and returns only a category suggestion', () => {
  const result = classifyText({ title: 'Bribe', description: 'Requested at office' }, makeModel());

  assert.deepEqual(result, {
    suggestion: 'Bribery',
    modelVersion: 'test-version',
    trainingDataStatus: 'synthetic_only',
    warning: 'Experimental suggestion trained on data that is not validated for real-world performance. Do not use as a finding or decision.'
  });
  assert.equal(Object.hasOwn(result, 'score'), false);
  assert.equal(Object.hasOwn(result, 'probability'), false);
});

test('supports the word-only logistic-regression candidate', () => {
  const model = makeModel();
  delete model.features.char;
  model.weights = [[2], [0]];
  const result = classifyText({ title: 'Bribe', description: 'Requested at office' }, model);
  assert.equal(result.suggestion, 'Bribery');
});

test('rejects malformed or unavailable runtime artifacts with an explicit error', () => {
  assert.throws(() => loadModel('missing-category-model.runtime.json'), ModelArtifactError);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kenya-watch-ml-'));
  try {
    const artifactPath = path.join(directory, 'invalid-model.json');
    fs.writeFileSync(artifactPath, JSON.stringify({
      ...makeModel(),
      realWorldPerformanceClaim: true
    }));
    assert.throws(() => loadModel(artifactPath), ModelArtifactError);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('allows a model suggestion only after this reviewer submits a category assessment', () => {
  const reviewerId = 'reviewer-1';
  assert.equal(hasIndependentCategoryAssessment({
    annotations: [{ reviewer: reviewerId, decision: 'category', category: 'Bribery' }]
  }, reviewerId), true);
  assert.equal(hasIndependentCategoryAssessment({
    annotations: [{ reviewer: 'reviewer-2', decision: 'category', category: 'Bribery' }]
  }, reviewerId), false);
  assert.equal(hasIndependentCategoryAssessment({
    annotations: [{ reviewer: reviewerId, decision: 'insufficient_information' }]
  }, reviewerId), false);
  assert.equal(hasIndependentCategoryAssessment({
    annotations: [{ decision: 'category', category: 'Bribery' }]
  }, reviewerId), false);
  assert.equal(hasIndependentCategoryAssessment(undefined, reviewerId), false);
});
