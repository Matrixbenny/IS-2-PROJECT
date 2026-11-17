const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
require('dotenv').config();
const createApp = require('../app');
const Report = require('../report.model');
const User = require('../user.model');

const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/kenya_watch_test';
const reviewerPassword = 'ReviewerPassw0rd!';
let app;
let reviewerOne;
let reviewerTwo;
let reviewerThree;
let admin;
let reviewerOneCookie;
let reviewerTwoCookie;
let reviewerThreeCookie;
let adminCookie;

async function signIn(email, password) {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  assert.strictEqual(response.status, 200);
  return response.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];
}

async function createReport(trackingReference, overrides = {}) {
  return Report.create({
    trackingReference,
    title: 'Case title deliberately hidden during blind labelling',
    reportedCategory: 'Bribery',
    categorySpecificDetails: { demandedOrOffered: 'A detail based on the reporter selection' },
    description: 'The narrative describing the alleged conduct is what reviewers assess.',
    county: 'Nairobi',
    subCounty: 'Westlands',
    classification: { category: 'Bribery', urgency: 'High', confidence: 0.7, classifiedAt: new Date() },
    ...overrides
  });
}

test.before(async () => {
  process.env.NODE_ENV = 'test';
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.db.dropDatabase();
  app = createApp();
  process.env.ADMIN_EMAIL = 'ml-admin@example.com';
  // The seeded Admin signs in with its database password, so the environment hash
  // (possibly present in the developer's .env) must not override it.
  delete process.env.ADMIN_PASSWORD_HASH;
  [reviewerOne, reviewerTwo, reviewerThree, admin] = await User.create([
    { name: 'First Reviewer', email: 'ml-reviewer-one@example.com', password: reviewerPassword, role: 'reviewer' },
    { name: 'Second Reviewer', email: 'ml-reviewer-two@example.com', password: reviewerPassword, role: 'reviewer' },
    { name: 'Third Reviewer', email: 'ml-reviewer-three@example.com', password: reviewerPassword, role: 'reviewer' },
    { name: 'ML Admin', email: process.env.ADMIN_EMAIL, password: 'MLAdminPassw0rd!', role: 'admin' }
  ]);
  reviewerOneCookie = await signIn(reviewerOne.email, reviewerPassword);
  reviewerTwoCookie = await signIn(reviewerTwo.email, reviewerPassword);
  reviewerThreeCookie = await signIn(reviewerThree.email, reviewerPassword);
  adminCookie = await signIn(admin.email, 'MLAdminPassw0rd!');
});

test.after(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('category labels are blinded, independent, and accepted only after two distinct reviewers agree', async () => {
  const report = await createReport('KW-MLAGREE1');
  const unauthenticated = await request(app)
    .post(`/api/reports/${report._id}/category-review/annotations`)
    .send({ category: 'Bribery' });
  assert.strictEqual(unauthenticated.status, 401);

  const firstQueue = await request(app)
    .get('/api/reports/queue')
    .set('Cookie', reviewerOneCookie);
  const firstView = firstQueue.body.find((item) => item._id === report._id.toString());
  assert.ok(firstView);
  assert.strictEqual(firstView.reportedCategory, undefined);
  assert.strictEqual(firstView.categorySpecificDetails, undefined);
  assert.strictEqual(firstView.classification, null);
  assert.strictEqual(firstView.suggestedAgency, undefined);
  assert.strictEqual(firstView.categoryReview.adjudicatedCategory, null);
  const firstDetail = await request(app)
    .get(`/api/reports/${report._id}`)
    .set('Cookie', reviewerOneCookie);
  assert.strictEqual(firstDetail.body.reportedCategory, undefined);
  assert.strictEqual(firstDetail.body.categorySpecificDetails, undefined);
  assert.strictEqual(firstDetail.body.classification, null);
  const relatedCasesBeforeLabel = await request(app)
    .get(`/api/reports/${report._id}/related-suggestions`)
    .set('Cookie', reviewerOneCookie);
  assert.strictEqual(relatedCasesBeforeLabel.status, 403);

  const firstLabel = await request(app)
    .post(`/api/reports/${report._id}/category-review/annotations`)
    .set('Cookie', reviewerOneCookie)
    .send({ category: 'Bribery', note: 'The described allegation matches the category definition.' });
  assert.strictEqual(firstLabel.status, 201);
  assert.strictEqual(firstLabel.body.annotationCount, 1);
  assert.strictEqual(firstLabel.body.status, 'awaiting_second_review');

  const firstReviewerCannotRelabel = await request(app)
    .post(`/api/reports/${report._id}/category-review/annotations`)
    .set('Cookie', reviewerOneCookie)
    .send({ category: 'Embezzlement' });
  assert.strictEqual(firstReviewerCannotRelabel.status, 409);

  const secondQueue = await request(app)
    .get('/api/reports/queue')
    .set('Cookie', reviewerTwoCookie);
  const secondView = secondQueue.body.find((item) => item._id === report._id.toString());
  assert.strictEqual(secondView.reportedCategory, undefined);
  assert.strictEqual(secondView.classification, null);

  const secondLabel = await request(app)
    .post(`/api/reports/${report._id}/category-review/annotations`)
    .set('Cookie', reviewerTwoCookie)
    .send({ category: 'Bribery' });
  assert.strictEqual(secondLabel.status, 201);
  assert.strictEqual(secondLabel.body.status, 'agreed');
  assert.strictEqual(secondLabel.body.adjudicatedCategory, 'Bribery');

  const unblinded = await request(app)
    .get(`/api/reports/${report._id}`)
    .set('Cookie', reviewerTwoCookie);
  assert.strictEqual(unblinded.body.reportedCategory, 'Bribery');
  assert.strictEqual(unblinded.body.classification.category, 'Bribery');
  assert.strictEqual(unblinded.body.categoryReview.ownCategory, 'Bribery');
  const thirdReviewerQueue = await request(app)
    .get('/api/reports/queue')
    .set('Cookie', reviewerThreeCookie);
  const thirdReviewerView = thirdReviewerQueue.body.find((item) => item._id === report._id.toString());
  assert.strictEqual(thirdReviewerView.reportedCategory, undefined);
  assert.strictEqual(thirdReviewerView.classification, null);
  assert.strictEqual(thirdReviewerView.categoryReview.adjudicatedCategory, null);
  const thirdReviewerReview = await request(app)
    .get(`/api/reports/${report._id}/category-review`)
    .set('Cookie', reviewerThreeCookie);
  assert.strictEqual(thirdReviewerReview.body.adjudicatedCategory, null);
  const stored = await Report.findById(report._id);
  assert.strictEqual(stored.categoryReview.annotations.length, 2);
  assert.strictEqual(stored.categoryReview.adjudicatedBy, null);
});

test('insufficient information is recorded without inventing a category and is excluded from suggestions', async () => {
  const report = await createReport('KW-MLUNSURE');
  const missingReason = await request(app)
    .post(`/api/reports/${report._id}/category-review/annotations`)
    .set('Cookie', reviewerOneCookie)
    .send({ decision: 'insufficient_information' });
  assert.strictEqual(missingReason.status, 400);

  const first = await request(app)
    .post(`/api/reports/${report._id}/category-review/annotations`)
    .set('Cookie', reviewerOneCookie)
    .send({
      decision: 'insufficient_information',
      note: 'The report does not identify the alleged action or the benefit sought.'
    });

    test('related-case suggestions rank same-county text matches without exposing candidate labels', async () => {
      const report = await createReport('KW-MLSIMQRY', {
        title: 'Unofficial payment for clinic permit renewal',
        description: 'A county health officer demanded a bribe to approve a clinic license renewal.'
      });
      const matchingReport = await Report.create({
        trackingReference: 'KW-MLSIMMAT',
        title: 'Clinic license approval payment',
        reportedCategory: 'Extortion',
        description: 'At the county office, a health officer requested an unofficial bribe for clinic license approval.',
        county: 'Nairobi',
        subCounty: 'Westlands'
      });
      await Report.create({
        trackingReference: 'KW-MLSIMOTH',
        title: 'Tender documents',
        reportedCategory: 'Procurement Fraud',
        description: 'A supplier falsified bid documents for a road contract.',
        county: 'Nairobi',
        subCounty: 'Kibra'
      });
      await request(app)
        .post(`/api/reports/${report._id}/category-review/annotations`)
        .set('Cookie', reviewerOneCookie)
        .send({ category: 'Bribery' });

      const response = await request(app)
        .get(`/api/reports/${report._id}/related-suggestions`)
        .set('Cookie', reviewerOneCookie);

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.length, 1);
      assert.strictEqual(response.body[0].id, matchingReport._id.toString());
      assert.ok(response.body[0].similarityPercent > 12);
      assert.ok(response.body[0].sharedTerms.includes('clinic'));
      assert.strictEqual(response.body[0].reportedCategory, undefined);
      assert.strictEqual(response.body[0].trackingReference, undefined);
    });
  assert.strictEqual(first.status, 201);
  assert.strictEqual(first.body.ownDecision, 'insufficient_information');
  assert.strictEqual(first.body.ownCategory, null);

  const relatedSuggestions = await request(app)
    .get(`/api/reports/${report._id}/related-suggestions`)
    .set('Cookie', reviewerOneCookie);
  assert.strictEqual(relatedSuggestions.status, 403);

  const second = await request(app)
    .post(`/api/reports/${report._id}/category-review/annotations`)
    .set('Cookie', reviewerTwoCookie)
    .send({
      decision: 'insufficient_information',
      note: 'The described events are too vague to map to a category.'
    });
  assert.strictEqual(second.status, 201);
  assert.strictEqual(second.body.status, 'insufficient_information');
  assert.strictEqual(second.body.adjudicatedDecision, 'insufficient_information');
  assert.strictEqual(second.body.adjudicatedCategory, null);

  const secondReviewerView = await request(app)
    .get(`/api/reports/${report._id}/category-review`)
    .set('Cookie', reviewerTwoCookie);
  assert.strictEqual(secondReviewerView.body.ownDecision, 'insufficient_information');
  assert.strictEqual(secondReviewerView.body.adjudicatedCategory, null);

  const stored = await Report.findById(report._id);
  assert.strictEqual(stored.categoryReview.annotations.length, 2);
  assert.ok(stored.categoryReview.annotations.every((annotation) => annotation.category === null));
  assert.strictEqual(stored.categoryReview.adjudicatedCategory, null);
});

test('category disagreement requires a documented Admin adjudication before entering the reviewed dataset', async () => {
  const report = await createReport('KW-MLDISAG1');
  const first = await request(app)
    .post(`/api/reports/${report._id}/category-review/annotations`)
    .set('Cookie', reviewerOneCookie)
    .send({ category: 'Bribery', note: 'The described conduct meets this category definition.' });
  assert.strictEqual(first.status, 201);
  const second = await request(app)
    .post(`/api/reports/${report._id}/category-review/annotations`)
    .set('Cookie', reviewerTwoCookie)
    .send({ category: 'Embezzlement' });
  assert.strictEqual(second.status, 201);
  assert.strictEqual(second.body.status, 'needs_adjudication');
  assert.strictEqual(second.body.adjudicatedCategory, null);

  const adminQueueBeforeAdjudication = await request(app)
    .get('/api/reports/queue')
    .set('Cookie', adminCookie);
  const adminCaseBeforeAdjudication = adminQueueBeforeAdjudication.body.find(
    (item) => item._id === report._id.toString()
  );
  assert.strictEqual(adminCaseBeforeAdjudication.reportedCategory, undefined);
  assert.strictEqual(adminCaseBeforeAdjudication.classification, null);
  assert.strictEqual(adminCaseBeforeAdjudication.categoryReview.adjudicatedCategory, null);

  const reviewerCannotResolveDisagreement = await request(app)
    .patch(`/api/reports/${report._id}/category-review/adjudication`)
    .set('Cookie', reviewerOneCookie)
    .send({ category: 'Bribery', note: "Reviewer's reason" });
  assert.strictEqual(reviewerCannotResolveDisagreement.status, 403);

  const missingRationale = await request(app)
    .patch(`/api/reports/${report._id}/category-review/adjudication`)
    .set('Cookie', adminCookie)
    .send({ category: 'Bribery', note: '   ' });
  assert.strictEqual(missingRationale.status, 400);

  const adminView = await request(app)
    .get(`/api/reports/${report._id}/category-review`)
    .set('Cookie', adminCookie);
  assert.deepStrictEqual(
    adminView.body.proposedAnnotations.map((item) => item.category),
    ['Bribery', 'Embezzlement']
  );
  assert.ok(adminView.body.proposedAnnotations[0].note);

  const adjudication = await request(app)
    .patch(`/api/reports/${report._id}/category-review/adjudication`)
    .set('Cookie', adminCookie)
    .send({
      category: 'Bribery',
      note: 'The described conduct matches the reviewed category definition; the reporter selection was not used as the deciding label.'
    });
  assert.strictEqual(adjudication.status, 200);
  assert.strictEqual(adjudication.body.status, 'adjudicated');
  assert.strictEqual(adjudication.body.adjudicatedCategory, 'Bribery');
  const adminCaseAfterAdjudication = await request(app)
    .get(`/api/reports/${report._id}`)
    .set('Cookie', adminCookie);
  assert.strictEqual(adminCaseAfterAdjudication.body.categoryReview.adjudicatedCategory, 'Bribery');

  const stored = await Report.findById(report._id);
  assert.strictEqual(stored.categoryReview.annotations.length, 2);
  assert.strictEqual(stored.categoryReview.adjudicationNote.length > 0, true);
  assert.strictEqual(stored.categoryReview.adjudicatedBy.toString(), admin._id.toString());
});

test('mixed category and insufficient-information reviews require Admin adjudication', async () => {
  const report = await createReport('KW-MLMIXED');
  const first = await request(app)
    .post(`/api/reports/${report._id}/category-review/annotations`)
    .set('Cookie', reviewerOneCookie)
    .send({
      decision: 'insufficient_information',
      note: 'The report does not say what action the official allegedly took.'
    });
  assert.strictEqual(first.status, 201);

  const second = await request(app)
    .post(`/api/reports/${report._id}/category-review/annotations`)
    .set('Cookie', reviewerTwoCookie)
    .send({ decision: 'category', category: 'Abuse of Office' });
  assert.strictEqual(second.status, 201);
  assert.strictEqual(second.body.status, 'needs_adjudication');
  assert.strictEqual(second.body.adjudicatedCategory, null);

  const adminView = await request(app)
    .get(`/api/reports/${report._id}/category-review`)
    .set('Cookie', adminCookie);
  assert.deepStrictEqual(
    adminView.body.proposedAnnotations.map((item) => item.decision),
    ['insufficient_information', 'category']
  );

  const adjudication = await request(app)
    .patch(`/api/reports/${report._id}/category-review/adjudication`)
    .set('Cookie', adminCookie)
    .send({
      decision: 'insufficient_information',
      note: 'The narrative does not contain enough detail to confidently assign a category.'
    });
  assert.strictEqual(adjudication.status, 200);
  assert.strictEqual(adjudication.body.adjudicatedDecision, 'insufficient_information');
  assert.strictEqual(adjudication.body.adjudicatedCategory, null);

  const stored = await Report.findById(report._id);
  assert.strictEqual(stored.categoryReview.status, 'adjudicated');
  assert.strictEqual(stored.categoryReview.adjudicatedDecision, 'insufficient_information');
  assert.strictEqual(stored.categoryReview.adjudicatedCategory, null);
});

test('category-review endpoints validate categories and do not accept archived reports', async () => {
  const report = await createReport('KW-MLINVALID');
  const invalidCategory = await request(app)
    .post(`/api/reports/${report._id}/category-review/annotations`)
    .set('Cookie', reviewerOneCookie)
    .send({ category: 'Invented category' });
  assert.strictEqual(invalidCategory.status, 400);

  report.archivedAt = new Date();
  await report.save();
  const archived = await request(app)
    .post(`/api/reports/${report._id}/category-review/annotations`)
    .set('Cookie', reviewerOneCookie)
    .send({ category: 'Bribery' });
  assert.strictEqual(archived.status, 404);
});
