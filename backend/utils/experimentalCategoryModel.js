const fs = require('node:fs');
const path = require('node:path');
const { CATEGORIES } = require('./categories');
const { normaliseForMatching } = require('./kenyaLingo');

const DEFAULT_MODEL_PATH = path.resolve(__dirname, '../../ml/artifacts/category_model.runtime.json');
const MAX_MODEL_BYTES = 100 * 1024 * 1024;
const MODEL_WARNING = 'Experimental suggestion trained on data that is not validated for real-world performance. Do not use as a finding or decision.';
let cachedModel;
let cachedModelPath;

class ModelArtifactError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ModelArtifactError';
  }
}

function hasIndependentCategoryAssessment(review, reviewerId) {
  const annotations = Array.isArray(review?.annotations) ? review.annotations : [];
  const ownAnnotation = annotations.find((annotation) => annotation?.reviewer?.toString() === reviewerId.toString());
  const ownDecision = ownAnnotation?.decision || (ownAnnotation?.category ? 'category' : null);
  return ownDecision === 'category';
}

function validateModel(model) {
  if (!model || model.schemaVersion !== 1 || model.realWorldPerformanceClaim !== false) {
    throw new ModelArtifactError('The experimental category model artifact has an unsupported format.');
  }
  if (typeof model.modelVersion !== 'string' || !model.modelVersion ||
    typeof model.trainingDataStatus !== 'string' || !model.trainingDataStatus) {
    throw new ModelArtifactError('The experimental category model is missing its provenance metadata.');
  }
  if (!Array.isArray(model.categories) || model.categories.length !== CATEGORIES.length ||
    model.categories.some((category) => !CATEGORIES.includes(category)) ||
    new Set(model.categories).size !== model.categories.length) {
    throw new ModelArtifactError('The experimental category model has an invalid category list.');
  }

  const word = model.features?.word;
  const char = model.features?.char;
  if (!word || !model.weights || !Array.isArray(model.intercepts) ||
    model.weights.length !== model.categories.length || model.intercepts.length !== model.categories.length) {
    throw new ModelArtifactError('The experimental category model is incomplete.');
  }

  const featureCount = word.idf?.length + (char?.idf?.length || 0);
  if (!Number.isInteger(featureCount) || featureCount <= 0 ||
    model.weights.some((weights) => !Array.isArray(weights) || weights.length !== featureCount ||
      weights.some((weight) => !Number.isFinite(weight))) ||
    model.intercepts.some((value) => !Number.isFinite(value))) {
    throw new ModelArtifactError('The experimental category model has invalid classifier weights.');
  }

  for (const [name, vectorizer] of Object.entries({ word, ...(char ? { char } : {}) })) {
    if (!Array.isArray(vectorizer.idf) || vectorizer.idf.some((value) => !Number.isFinite(value) || value <= 0) ||
      !vectorizer.vocabulary || typeof vectorizer.vocabulary !== 'object' ||
      !Array.isArray(vectorizer.ngramRange) || vectorizer.ngramRange.length !== 2 ||
      vectorizer.ngramRange.some((value) => !Number.isInteger(value) || value <= 0)) {
      throw new ModelArtifactError(`The experimental category model has invalid ${name} features.`);
    }
    const indices = Object.values(vectorizer.vocabulary);
    if (indices.some((index) => !Number.isInteger(index) || index < 0 || index >= vectorizer.idf.length) ||
      new Set(indices).size !== indices.length) {
      throw new ModelArtifactError(`The experimental category model has an invalid ${name} vocabulary.`);
    }
  }
}

function loadModel(modelPath = process.env.ML_CATEGORY_MODEL_PATH || DEFAULT_MODEL_PATH) {
  let contents;
  const resolvedPath = path.resolve(modelPath);
  if (cachedModel && cachedModelPath === resolvedPath) return cachedModel;
  try {
    const stats = fs.statSync(resolvedPath);
    if (stats.size > MAX_MODEL_BYTES) {
      throw new ModelArtifactError('The experimental category model artifact exceeds the supported size.');
    }
    contents = fs.readFileSync(resolvedPath, 'utf8');
  } catch (error) {
    if (error instanceof ModelArtifactError) throw error;
    throw new ModelArtifactError('Experimental category suggestions are unavailable. Train the model to create its runtime artifact.');
  }

  let model;
  try {
    model = JSON.parse(contents);
  } catch {
    throw new ModelArtifactError('The experimental category model artifact is not valid JSON.');
  }
  validateModel(model);
  cachedModel = model;
  cachedModelPath = resolvedPath;
  return model;
}

function addNgrams(target, tokens, minN, maxN) {
  for (let size = minN; size <= maxN; size += 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      const term = tokens.slice(index, index + size).join(' ');
      target.set(term, (target.get(term) || 0) + 1);
    }
  }
}

function wordTokens(text) {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || [];
}

function charNgrams(text, minN, maxN) {
  const features = new Map();
  for (const token of text.toLowerCase().split(/\s+/u).filter(Boolean)) {
    const padded = ` ${token} `;
    for (let size = minN; size <= maxN; size += 1) {
      for (let index = 0; index <= padded.length - size; index += 1) {
        const ngram = padded.slice(index, index + size);
        features.set(ngram, (features.get(ngram) || 0) + 1);
      }
    }
  }
  return features;
}

function vectorize(counts, vectorizer, offset) {
  const vector = [];
  let normSquared = 0;
  for (const [term, count] of counts) {
    const index = vectorizer.vocabulary[term];
    if (index === undefined) continue;
    const value = (1 + Math.log(count)) * vectorizer.idf[index];
    vector.push([offset + index, value]);
    normSquared += value * value;
  }
  if (normSquared === 0) return [];
  const norm = Math.sqrt(normSquared);
  return vector.map(([index, value]) => [index, value / norm]);
}

function classifyText({ title, description }, model = loadModel()) {
  // Apply the same Kenya-lingo expansion used at training-data export time
  // (ml/scripts/export-reviewed-dataset.js), so Sheng/Kiswahili/dialect and
  // mixed-language narratives are scored in the vocabulary the model knows.
  const fullText = normaliseForMatching(`${title} ${description}`);
  const word = model.features.word;
  const char = model.features.char;
  const wordCounts = new Map();
  addNgrams(wordCounts, wordTokens(fullText), word.ngramRange[0], word.ngramRange[1]);
  const features = vectorize(wordCounts, word, 0);
  if (char) {
    features.push(...vectorize(charNgrams(fullText, char.ngramRange[0], char.ngramRange[1]), char, word.idf.length));
  }

  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let categoryIndex = 0; categoryIndex < model.categories.length; categoryIndex += 1) {
    const score = features.reduce(
      (total, [featureIndex, value]) => total + model.weights[categoryIndex][featureIndex] * value,
      model.intercepts[categoryIndex]
    );
    if (score > bestScore) {
      bestScore = score;
      bestIndex = categoryIndex;
    }
  }

  return {
    suggestion: model.categories[bestIndex],
    modelVersion: model.modelVersion,
    trainingDataStatus: model.trainingDataStatus,
    warning: MODEL_WARNING
  };
}

module.exports = { ModelArtifactError, classifyText, hasIndependentCategoryAssessment, loadModel };
