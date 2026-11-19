const test = require('node:test');
const assert = require('node:assert/strict');
const { suggestRouting } = require('../utils/routing');
const { AGENCIES, slugify } = require('../utils/agencies');

const EACC = AGENCIES[0].name;
const DCI = AGENCIES[1].name;
const ODPP = AGENCIES[2].name;
const IPOA = 'Independent Policing Oversight Authority (IPOA)';
const recommended = (routing) => routing.agencies.filter((a) => a.recommended).map((a) => a.name);

test('a plain bribery report goes to one lead investigator, not to every agency', () => {
  const routing = suggestRouting({
    reportedCategory: 'Bribery',
    title: 'Clerk wanted a bribe',
    description: 'A licensing clerk demanded money before processing my permit.'
  });
  assert.deepStrictEqual(recommended(routing), [EACC]);
  assert.strictEqual(routing.multiAgency, false);
  const dci = routing.agencies.find((a) => a.name === DCI);
  assert.strictEqual(dci.recommended, false);
  assert.match(dci.note, /overlaps/i);
});

test('prosecutors are a follow-on step and are never recommended for intake', () => {
  const routing = suggestRouting({
    reportedCategory: 'Bribery',
    additionalCategories: ['Embezzlement', 'Procurement Fraud'],
    title: 't',
    description: 'A long enough description of the matter at hand.'
  });
  const odpp = routing.agencies.find((a) => a.name === ODPP);
  assert.strictEqual(odpp.stage, 'follow_on');
  assert.strictEqual(odpp.recommended, false);
  assert.match(odpp.note, /after an investigating agency/i);
});

test('a mixed bribery and forgery case reaches both the EACC and the DCI', () => {
  const routing = suggestRouting({
    reportedCategory: 'Bribery',
    additionalCategories: ['Fraud/Forgery of Documents'],
    title: 'Forged title deed',
    description: 'An officer took a payment and a forged document was used to transfer land.'
  });
  assert.deepStrictEqual(recommended(routing).sort(), [DCI, EACC].sort());
  assert.strictEqual(routing.multiAgency, true);
  const dci = routing.agencies.find((a) => a.name === DCI);
  assert.deepStrictEqual(dci.categories.includes('Fraud/Forgery of Documents'), true);
});

test('wrongdoing described only in the narrative is detected and explained', () => {
  const routing = suggestRouting({
    reportedCategory: 'Bribery',
    title: 'Hospital procurement',
    description: 'The administrator embezzled public funds and also took a kickback on the tender.'
  });
  const embezzlement = routing.categories.find((c) => c.category === 'Embezzlement');
  assert.ok(embezzlement, 'embezzlement should be detected from the narrative');
  assert.match(embezzlement.sources.join(' '), /found in the narrative/);
});

test('police oversight is suggested only when the narrative involves police', () => {
  const withPolice = suggestRouting({
    reportedCategory: 'Extortion',
    title: 'Roadblock',
    description: 'A police officer forced to pay me cash at a roadblock or he would impound my vehicle.'
  });
  assert.ok(recommended(withPolice).includes(IPOA));

  const without = suggestRouting({
    reportedCategory: 'Extortion',
    title: 'Permit',
    description: 'A licensing clerk coerced me to pay extra before issuing my trading permit.'
  });
  assert.ok(!without.agencies.some((a) => a.name === IPOA));
});

test('model scores can add a category, and routing works without them', () => {
  const base = { reportedCategory: 'Bribery', title: 't', description: 'A plain description of the matter.' };
  const withModel = suggestRouting({
    ...base,
    modelScores: [{ category: 'Bribery', score: 0.5 }, { category: 'Nepotism/Favoritism', score: 0.4 }, { category: 'Other', score: 0.1 }]
  });
  const nepotism = withModel.categories.find((c) => c.category === 'Nepotism/Favoritism');
  assert.match(nepotism.sources.join(' '), /experimental model/);
  assert.strictEqual(withModel.modelUsed, true);
  assert.strictEqual(suggestRouting(base).modelUsed, false);
});

test('suggestions flag which agencies currently have an active portal account', () => {
  const routing = suggestRouting(
    { reportedCategory: 'Bribery', title: 't', description: 'A plain description of the matter.' },
    { availableSlugs: new Set([slugify(EACC)]) }
  );
  assert.strictEqual(routing.agencies.find((a) => a.name === EACC).available, true);
  assert.strictEqual(routing.agencies.find((a) => a.name === DCI).available, false);
});

test('"Other" never produces a routing category', () => {
  const routing = suggestRouting({ reportedCategory: 'Other', title: 't', description: 'Nothing specific is described here.' });
  assert.deepStrictEqual(routing.categories, []);
  assert.deepStrictEqual(routing.agencies, []);
});
