const test = require('node:test');
const assert = require('node:assert/strict');
const { suggestRelatedCases } = require('../utils/relatedCaseMatcher');

const query = {
  _id: 'query',
  county: 'Nairobi',
  title: 'Unofficial payment for clinic permit renewal',
  description: 'A county health officer demanded a bribe to approve a clinic license renewal.'
};

test('ranks textually similar reports in the same county without requiring matching categories', () => {
  const suggestions = suggestRelatedCases(query, [
    {
      _id: 'weak-match',
      county: 'Nairobi',
      title: 'Clinic permit',
      description: 'A clinic permit was issued after the review.'
    },
    {
      _id: 'strong-match',
      county: 'Nairobi',
      title: 'Clinic license approval payment',
      description: 'At the county office, a health officer requested an unofficial bribe for clinic license approval.',
      reportedCategory: 'Extortion'
    },
    {
      _id: 'different-county',
      county: 'Mombasa',
      title: 'Clinic license approval payment',
      description: 'At the county office, a health officer requested an unofficial bribe for clinic license approval.'
    },
    {
      _id: 'same-report',
      county: 'Nairobi',
      title: query.title,
      description: query.description
    },
    {
      _id: 'unrelated',
      county: 'Nairobi',
      title: 'Procurement tender documents',
      description: 'A supplier falsified bid documents for a road contract.'
    }
  ]);

  assert.equal(suggestions.length, 3);
  assert.equal(suggestions[0].report._id, 'same-report');
  assert.equal(suggestions[1].report._id, 'strong-match');
  assert.equal(suggestions[2].report._id, 'weak-match');
  assert.ok(suggestions[0].similarity > suggestions[1].similarity);
  assert.ok(suggestions[1].similarity > suggestions[2].similarity);
  assert.ok(suggestions[1].sharedTerms.includes('clinic'));
});

test('does not present low-overlap text as a related-report recommendation', () => {
  const suggestions = suggestRelatedCases(query, [{
    _id: 'unrelated',
    county: 'Nairobi',
    title: 'Water service interruption',
    description: 'Several households experienced a temporary interruption to water supply.'
  }]);

  assert.deepEqual(suggestions, []);
});

test('limits the number of suggestions and returns them in descending similarity', () => {
  const candidates = Array.from({ length: 8 }, (_, index) => ({
    _id: `similar-${index}`,
    county: 'Nairobi',
    title: `Clinic permit approval ${index}`,
    description: `A health officer requested payment to approve the clinic permit renewal ${index}.`
  }));
  const suggestions = suggestRelatedCases(query, candidates, { limit: 3 });

  assert.equal(suggestions.length, 3);
  assert.ok(suggestions[0].similarity >= suggestions[1].similarity);
  assert.ok(suggestions[1].similarity >= suggestions[2].similarity);
});
