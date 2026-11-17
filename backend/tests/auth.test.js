const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const request = require('supertest');
require('dotenv').config();
const createApp = require('../app');
const User = require('../user.model');
const Report = require('../report.model');
const AuditEvent = require('../audit-event.model');
const Notification = require('../notification.model');
const Session = require('../session.model');
const mailer = require('../utils/mailer');

const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/kenya_watch_test';

let app;
let authTestAddress = 10;

function authPost(path) {
  authTestAddress += 1;
  return request(app)
    .post(path)
    .set('X-Forwarded-For', `198.51.100.${authTestAddress}`);
}

function submitReviewerApplication(email, name = 'Applicant Reviewer') {
  return authPost('/api/auth/reviewer-application')
    .field('name', name)
    .field('email', email)
    .field('password', 'StrongPassw0rd!')
    .field('applicationNote', 'I can review reports carefully and follow the project labeling guidance.')
    .attach('cv', Buffer.from('%PDF-1.7\nCV document'), {
      filename: 'applicant-cv.pdf',
      contentType: 'application/pdf'
    })
    .attach('qualification', Buffer.from('%PDF-1.7\nQualification document'), {
      filename: 'qualification.pdf',
      contentType: 'application/pdf'
    });
}

// Test admins are seeded with a database password, so clear the environment hash
// (which may be set in the developer's .env) to make the seeded password authoritative.
async function loginAsAdmin(email, password) {
  process.env.ADMIN_EMAIL = email;
  delete process.env.ADMIN_PASSWORD_HASH;
  return authPost('/api/auth/login').send({ email, password });
}

test.before(async () => {
  process.env.NODE_ENV = 'test';
  await mongoose.connect(TEST_MONGO_URI);
  app = createApp();
  app.set('trust proxy', 1);
});

test.after(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
  authTestAddress = 10;
});

test('POST /api/auth/register rejects a password shorter than 8 characters', async () => {
  const res = await authPost('/api/auth/register').send({
    name: 'Test User', email: 'short-pass@example.com', password: 'abc123'
  });
  assert.strictEqual(res.status, 400);
});

test('POST /api/auth/register creates a Path B account and sets an httpOnly session cookie', async () => {
  const res = await authPost('/api/auth/register').send({
    name: 'Test User', email: 'testuser@example.com', password: 'StrongPassw0rd!'
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.user.role, 'user', 'Public registration must always default to the user role');
  const cookie = res.headers['set-cookie'].find((c) => c.startsWith('kw_token='));
  assert.ok(cookie, 'Login must set the kw_token cookie');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Path=\//i, 'The session cookie must be available to both the public API and agency portal');

  const user = await User.findOne({ email: 'testuser@example.com' });
  assert.ok(user.password !== 'StrongPassw0rd!', 'Passwords must not be stored in plaintext');
  assert.match(user.password, /^\$2[aby]\$11\$/, 'Passwords must use salted bcrypt with the configured work factor');
  assert.strictEqual(await user.comparePassword('StrongPassw0rd!'), true);
  assert.strictEqual(await user.comparePassword('WrongPassword!'), false);
});

test('POST /api/auth/register rejects a duplicate email', async () => {
  const res = await authPost('/api/auth/register').send({
    name: 'Another User', email: 'testuser@example.com', password: 'StrongPassw0rd!'
  });
  assert.strictEqual(res.status, 409);
});

test('reviewer application requires both valid PDF documents', async () => {
  const incomplete = await authPost('/api/auth/reviewer-application')
    .field('name', 'Incomplete Reviewer')
    .field('email', 'incomplete-reviewer@example.com')
    .field('password', 'StrongPassw0rd!')
    .field('applicationNote', 'I can carefully review reports and follow the project labeling guidance.');
  assert.strictEqual(incomplete.status, 400);

  const invalidPdf = await authPost('/api/auth/reviewer-application')
    .field('name', 'Invalid PDF Reviewer')
    .field('email', 'invalid-pdf-reviewer@example.com')
    .field('password', 'StrongPassw0rd!')
    .field('applicationNote', 'I can carefully review reports and follow the project labeling guidance.')
    .attach('cv', Buffer.from('not a PDF'), { filename: 'applicant-cv.pdf', contentType: 'application/pdf' })
    .attach('qualification', Buffer.from('%PDF-1.7\nQualification'), { filename: 'qualification.pdf', contentType: 'application/pdf' });
  assert.strictEqual(invalidPdf.status, 400);
  assert.strictEqual(await User.exists({ email: 'incomplete-reviewer@example.com' }), null);
  assert.strictEqual(await User.exists({ email: 'invalid-pdf-reviewer@example.com' }), null);
});

test('reviewer applications remain unable to sign in until Admin approval', async () => {
  const application = await submitReviewerApplication('applicant-reviewer@example.com');
  assert.strictEqual(application.status, 202);
  assert.strictEqual(application.headers['set-cookie'], undefined);
  assert.match(application.body.message, /awaiting Admin approval/i);

  let applicant = await User.findOne({ email: 'applicant-reviewer@example.com' });
  assert.strictEqual(applicant.role, 'reviewer_pending');
  assert.strictEqual(applicant.reviewerApplicationStatus, 'pending');
  assert.strictEqual(applicant.isActive, false);
  assert.strictEqual(await applicant.comparePassword('StrongPassw0rd!'), true);

  const pendingLogin = await authPost('/api/auth/login').send({
    email: applicant.email,
    password: 'StrongPassw0rd!'
  });
  assert.strictEqual(pendingLogin.status, 403);
  assert.match(pendingLogin.body.error, /awaiting Admin approval/i);
  assert.strictEqual(pendingLogin.headers['set-cookie'], undefined);

  const admin = await User.create({
    name: 'Reviewer Approval Admin',
    email: 'reviewer-approval-admin@example.com',
    password: 'AdminPassw0rd!',
    role: 'admin'
  });
  const previousAdminEmail = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = admin.email;
  const previousAdminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  delete process.env.ADMIN_PASSWORD_HASH;
  try {
    const adminLogin = await authPost('/api/auth/login').send({
      email: admin.email,
      password: 'AdminPassw0rd!'
    });
    assert.strictEqual(adminLogin.status, 200);
    const adminCookie = adminLogin.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];

    const unauthorizedList = await request(app).get('/api/users/reviewer-applications');
    assert.strictEqual(unauthorizedList.status, 401);

    const applications = await request(app)
      .get('/api/users/reviewer-applications')
      .set('Cookie', adminCookie);
    assert.strictEqual(applications.status, 200);
    assert.strictEqual(applications.body.length, 1);
    assert.strictEqual(applications.body[0].email, applicant.email);
    assert.strictEqual(applications.body[0].password, undefined);
    assert.deepStrictEqual(
      applications.body[0].reviewerApplicationDocuments.map((document) => document.kind).sort(),
      ['cv', 'qualification']
    );
    const privateDocument = await request(app)
      .get(`/api/users/${applicant._id}/reviewer-application/documents/${applications.body[0].reviewerApplicationDocuments[0].gridFsId}`);
    assert.strictEqual(privateDocument.status, 401);

    const notYetViewed = await request(app)
      .patch(`/api/users/${applicant._id}/reviewer-application`)
      .set('Cookie', adminCookie)
      .send({ decision: 'approve', documentsVerified: true });
    assert.strictEqual(notYetViewed.status, 400);

    for (const document of applications.body[0].reviewerApplicationDocuments) {
      const downloaded = await request(app)
        .get(`/api/users/${applicant._id}/reviewer-application/documents/${document.gridFsId}`)
        .set('Cookie', adminCookie)
        .buffer(true)
        .parse((stream, callback) => {
          const chunks = [];
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', () => callback(null, Buffer.concat(chunks)));
        });
      assert.strictEqual(downloaded.status, 200);
      assert.match(downloaded.headers['content-disposition'], /attachment/);
      assert.match(downloaded.body.toString('ascii'), /^%PDF-/);
    }

    const missingReason = await request(app)
      .patch(`/api/users/${applicant._id}/reviewer-application`)
      .set('Cookie', adminCookie)
      .send({ decision: 'reject', reason: 'No' });
    assert.strictEqual(missingReason.status, 400);

    const approved = await request(app)
      .patch(`/api/users/${applicant._id}/reviewer-application`)
      .set('Cookie', adminCookie)
      .send({ decision: 'approve', documentsVerified: true });
    assert.strictEqual(approved.status, 200);
    assert.strictEqual(approved.body.role, 'reviewer');
    assert.strictEqual(approved.body.isActive, true);
    assert.strictEqual(approved.body.reviewerApplicationStatus, 'approved');

    applicant = await User.findById(applicant._id);
    assert.strictEqual(applicant.reviewerApplicationReviewedBy.toString(), admin._id.toString());
    assert.strictEqual(applicant.reviewerApplicationDocumentsRetained, true);
    assert.strictEqual(
      applicant.reviewerApplicationDocuments.length,
      applications.body[0].reviewerApplicationDocuments.length,
      'The submitted CV/qualification PDFs must be retained after approval'
    );
    assert.strictEqual(applicant.reviewerApplicationDocumentsVerifiedBy.toString(), admin._id.toString());
    assert.strictEqual(
      await mongoose.connection.db.collection('reviewerApplications.files').countDocuments({
        _id: { $in: applications.body[0].reviewerApplicationDocuments.map((document) => new mongoose.Types.ObjectId(document.gridFsId)) }
      }),
      applications.body[0].reviewerApplicationDocuments.length,
      'The verified application PDFs must remain stored for the Admin audit trail'
    );
    const approvedLogin = await authPost('/api/auth/login').send({
      email: applicant.email,
      password: 'StrongPassw0rd!'
    });
    assert.strictEqual(approvedLogin.status, 200);
    assert.strictEqual(approvedLogin.body.user.role, 'reviewer');
  } finally {
    if (previousAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previousAdminEmail;
    if (previousAdminPasswordHash !== undefined) process.env.ADMIN_PASSWORD_HASH = previousAdminPasswordHash;
    await User.deleteMany({ email: { $in: [admin.email, 'applicant-reviewer@example.com'] } });
  }
});

test('Admin rejection keeps reviewer application inactive and permits a later reapplication', async () => {
  const admin = await User.create({
    name: 'Reviewer Rejection Admin',
    email: 'reviewer-rejection-admin@example.com',
    password: 'AdminPassw0rd!',
    role: 'admin'
  });
  const previousAdminEmail = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = admin.email;
  const previousAdminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  delete process.env.ADMIN_PASSWORD_HASH;
  try {
    const adminLogin = await authPost('/api/auth/login').send({
      email: admin.email,
      password: 'AdminPassw0rd!'
    });
    assert.strictEqual(adminLogin.status, 200);
    const adminCookie = adminLogin.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];
    const created = await submitReviewerApplication('reviewer-reapply@example.com', 'Rejected Applicant');
    assert.strictEqual(created.status, 202);
    const applicant = await User.findOne({ email: 'reviewer-reapply@example.com' });

    const rejected = await request(app)
      .patch(`/api/users/${applicant._id}/reviewer-application`)
      .set('Cookie', adminCookie)
      .send({ decision: 'reject', reason: 'Please provide more relevant review experience.' });
    assert.strictEqual(rejected.status, 200);
    assert.strictEqual(rejected.body.role, 'reviewer_pending');
    assert.strictEqual(rejected.body.isActive, false);
    assert.strictEqual(rejected.body.reviewerApplicationStatus, 'rejected');
    assert.strictEqual(
      (await User.findById(applicant._id)).reviewerApplicationDocuments.length,
      2,
      'Rejection must not delete the submitted application documents'
    );

    const rejectedLogin = await authPost('/api/auth/login').send({
      email: applicant.email,
      password: 'StrongPassw0rd!'
    });
    assert.strictEqual(rejectedLogin.status, 403);
    assert.match(rejectedLogin.body.error, /not approved/i);

    const reapplication = await authPost('/api/auth/reviewer-application')
      .field('name', 'Rejected Applicant Updated')
      .field('email', applicant.email)
      .field('password', 'AnotherPassw0rd!')
      .field('applicationNote', 'I have gained relevant review experience and wish to apply again.')
      .attach('cv', Buffer.from('%PDF-1.7\nUpdated CV'), { filename: 'updated-cv.pdf', contentType: 'application/pdf' })
      .attach('qualification', Buffer.from('%PDF-1.7\nUpdated qualification'), { filename: 'updated-qualification.pdf', contentType: 'application/pdf' });
    assert.strictEqual(reapplication.status, 202);
    const updatedApplicant = await User.findById(applicant._id);
    assert.strictEqual(updatedApplicant.name, 'Rejected Applicant Updated');
    assert.strictEqual(updatedApplicant.reviewerApplicationStatus, 'pending');
    assert.strictEqual(updatedApplicant.isActive, false);
    assert.strictEqual(await updatedApplicant.comparePassword('AnotherPassw0rd!'), true);
  } finally {
    if (previousAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previousAdminEmail;
    if (previousAdminPasswordHash !== undefined) process.env.ADMIN_PASSWORD_HASH = previousAdminPasswordHash;
    await User.deleteMany({ email: { $in: [admin.email, 'reviewer-reapply@example.com'] } });
  }
});

test('Admin identity is reserved and registration cannot assign the Admin role', async () => {
  const admin = await User.create({
    name: 'Configured Admin',
    email: 'fixed-admin@example.com',
    password: 'StrongPassw0rd!',
    role: 'admin'
  });

  const previousAdminEmail = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = admin.email;
  // Deliberately allow accounts on other reserved addresses (e.g. the local
  // mail sender) so one parallel test file cannot mark the others' users as
  // reserved mailboxes.
  process.env.RESERVED_EMAILS = '';
  try {
    const reserved = await authPost('/api/auth/register').send({
      name: 'Impersonator',
      email: ` ${admin.email.toUpperCase()} `,
      password: 'OtherPassw0rd!'
    });
    assert.strictEqual(reserved.status, 409);

    const ordinary = await authPost('/api/auth/register').send({
      name: 'Ordinary User',
      email: 'ordinary-role@example.com',
      password: 'StrongPassw0rd!',
      role: 'admin'
    });
    assert.strictEqual(ordinary.status, 201);
    assert.strictEqual(ordinary.body.user.role, 'user');

    const incorrect = await authPost('/api/auth/login').send({
      email: admin.email,
      password: 'WrongPassword!'
    });
    assert.strictEqual(incorrect.status, 401);

    const correct = await loginAsAdmin(admin.email, 'StrongPassw0rd!');
    assert.strictEqual(correct.status, 200);
    assert.strictEqual(correct.body.user.role, 'admin');
    const adminCookie = correct.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];

    const disallowedAdminCreate = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie)
      .send({
        name: 'Another Admin',
        email: 'another-admin@example.com',
        password: 'StrongPassw0rd!',
        role: 'admin'
      });
    assert.strictEqual(disallowedAdminCreate.status, 403);

    const reservedReviewerEmail = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie)
      .send({
        name: 'Reserved Email',
        email: admin.email,
        password: 'OtherPassw0rd!'
      });
    assert.strictEqual(reservedReviewerEmail.status, 409);

    const impersonatedEmail = await request(app)
      .patch(`/api/users/${ordinary.body.user.id}`)
      .set('Cookie', adminCookie)
      .send({ email: admin.email });
    assert.strictEqual(impersonatedEmail.status, 409);

    const changedAdminEmail = await request(app)
      .patch(`/api/users/${admin._id}`)
      .set('Cookie', adminCookie)
      .send({ email: 'alternate-admin@example.com' });
    assert.strictEqual(changedAdminEmail.status, 409);

    const deletedAdmin = await request(app)
      .delete(`/api/users/${admin._id}`)
      .set('Cookie', adminCookie);
    assert.strictEqual(deletedAdmin.status, 409);
  } finally {
    if (previousAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previousAdminEmail;
    await User.deleteOne({ _id: admin._id });
    await User.deleteOne({ email: 'ordinary-role@example.com' });
  }
});

test('Admin session is rejected when it does not match the configured Admin identity', async () => {
  const admin = await User.create({
    name: 'Session Admin',
    email: 'session-admin@example.com',
    password: 'StrongPassw0rd!',
    role: 'admin'
  });
  const login = await loginAsAdmin(admin.email, 'StrongPassw0rd!');
  assert.strictEqual(login.status, 200);
  const cookie = login.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];

  const previousAdminEmail = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = 'different-admin@example.com';
  try {
    const currentUser = await request(app).get('/api/auth/me').set('Cookie', cookie);
    assert.strictEqual(currentUser.status, 401);
    const adminOverview = await request(app).get('/api/reports/admin-overview').set('Cookie', cookie);
    assert.strictEqual(adminOverview.status, 401);
  } finally {
    if (previousAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previousAdminEmail;
    await User.deleteOne({ _id: admin._id });
  }
});

test('POST /api/auth/login rejects an incorrect password without revealing whether the account exists', async () => {
  const res = await authPost('/api/auth/login').send({
    email: 'testuser@example.com', password: 'WrongPassword!'
  });
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.error, 'Invalid email or password');
});

test('POST /api/auth/login succeeds with the correct password', async () => {
  const res = await authPost('/api/auth/login').send({
    email: 'testuser@example.com', password: 'StrongPassw0rd!'
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.user.email, 'testuser@example.com');
});

test('password reset emails a one-time link using the configured frontend origin', async (t) => {
  const user = await User.create({
    name: 'Reset User',
    email: 'reset-user@example.com',
    password: 'OldPassw0rd!'
  });
  const messages = [];
  t.mock.method(mailer, 'sendMail', async (message) => {
    messages.push(message);
    return { messageId: 'test-message' };
  });
  const previousFrontendOrigin = process.env.FRONTEND_ORIGIN;
  process.env.FRONTEND_ORIGIN = 'https://kenyawatch.example';
  try {
    const requested = await authPost('/api/auth/forgot-password')
      .send({ email: ' RESET-USER@EXAMPLE.COM ' });
    assert.strictEqual(requested.status, 200);
    assert.strictEqual(requested.body.message, 'If this email is registered, a password reset link will be sent.');
    assert.strictEqual(messages.length, 1);
    const link = messages[0].text.match(/https:\/\/kenyawatch\.example\/reset-password\?[^\s]+/);
    assert.ok(link, 'reset email should use configured site origin');
    const resetUrl = new URL(link[0]);
    const token = resetUrl.searchParams.get('token');
    assert.ok(token);
    const pendingResetUser = await User.findById(user._id);
    assert.notStrictEqual(pendingResetUser.resetPasswordTokenHash, token, 'only a hash is stored');

    const reset = await authPost('/api/auth/reset-password').send({
      email: resetUrl.searchParams.get('email'),
      token,
      newPassword: 'NewPassw0rd!'
    });
    assert.strictEqual(reset.status, 200);
    assert.strictEqual(await (await User.findById(user._id)).comparePassword('NewPassw0rd!'), true);
    assert.strictEqual((await User.findById(user._id)).resetPasswordTokenHash, null);

    const replay = await authPost('/api/auth/reset-password').send({
      email: resetUrl.searchParams.get('email'),
      token,
      newPassword: 'ThirdPassw0rd!'
    });
    assert.strictEqual(replay.status, 400);

    const unknownAccount = await authPost('/api/auth/forgot-password')
      .send({ email: 'not-registered@example.com' });
    assert.deepStrictEqual(unknownAccount.body, requested.body);
    assert.strictEqual(messages.length, 1, 'unknown accounts must not generate mail');
  } finally {
    if (previousFrontendOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = previousFrontendOrigin;
  }
});

test('password reset mail failure invalidates the reset token', async (t) => {
  const user = await User.create({
    name: 'Mail Failure User',
    email: 'mail-failure@example.com',
    password: 'OldPassw0rd!'
  });
  t.mock.method(mailer, 'sendMail', async () => {
    throw new Error('SMTP unavailable');
  });
  t.mock.method(console, 'error', () => {});

  const response = await authPost('/api/auth/forgot-password')
    .send({ email: user.email });
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.body.message, 'If this email is registered, a password reset link will be sent.');
  const savedUser = await User.findById(user._id);
  assert.strictEqual(savedUser.resetPasswordTokenHash, null);
  assert.strictEqual(savedUser.resetPasswordExpiry, null);
});

test('GET /api/auth/me requires authentication', async () => {
  const res = await request(app).get('/api/auth/me');
  assert.strictEqual(res.status, 401);
});

test('citizen can permanently delete their account after reauthentication and confirmation', async () => {
  const registration = await authPost('/api/auth/register').send({
    name: 'Account Deletion Citizen',
    email: 'account-deletion@example.com',
    password: 'StrongPassw0rd!'
  });
  assert.strictEqual(registration.status, 201);
  const cookie = registration.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];
  const user = await User.findOne({ email: 'account-deletion@example.com' });
  const report = await Report.create({
    trackingReference: 'KW-DELETE01',
    user: user._id,
    title: 'Account deletion test report',
    reportedCategory: 'Bribery',
    description: 'Report data must remain after account deletion.',
    county: 'Nairobi',
    subCounty: 'Westlands',
    comments: [{ author: user._id, text: 'Follow-up details remain anonymous.' }]
  });
  await Session.create({
    tokenId: 'account-deletion-session',
    user: user._id,
    expiresAt: new Date(Date.now() + 60_000)
  });
  await Notification.create({
    recipient: user._id,
    type: 'security',
    title: 'Account deletion test',
    message: 'This notification should be removed.'
  });
  const auditEvent = await AuditEvent.create({
    action: 'account_deletion_test',
    actor: user._id,
    actorRole: 'user',
    targetType: 'user',
    targetId: user._id.toString()
  });

  const wrongPassword = await request(app)
    .delete('/api/auth/me')
    .set('Cookie', cookie)
    .send({ password: 'WrongPassword!', confirmation: 'DELETE' });
  assert.strictEqual(wrongPassword.status, 401);
  assert.ok(await User.exists({ _id: user._id }), 'A failed reauthentication must not delete the account');

  const missingConfirmation = await request(app)
    .delete('/api/auth/me')
    .set('Cookie', cookie)
    .send({ password: 'StrongPassw0rd!', confirmation: 'delete' });
  assert.strictEqual(missingConfirmation.status, 400);
  assert.ok(await User.exists({ _id: user._id }), 'A missing exact confirmation must not delete the account');

  const deletion = await request(app)
    .delete('/api/auth/me')
    .set('Cookie', cookie)
    .send({ password: 'StrongPassw0rd!', confirmation: 'DELETE' });
  assert.strictEqual(deletion.status, 200);
  assert.match(deletion.body.message, /permanently deleted/i);
  assert.ok(deletion.headers['set-cookie'].some((value) => value.startsWith('kw_token=;')));
  assert.strictEqual(await User.exists({ _id: user._id }), null);
  assert.strictEqual(await Session.countDocuments({ user: user._id }), 0);
  assert.strictEqual(await Notification.countDocuments({ recipient: user._id }), 0);
  assert.strictEqual(await AuditEvent.findById(auditEvent._id).then((event) => event.actor), null);

  const retainedReport = await Report.findById(report._id);
  assert.ok(retainedReport, 'The submitted report must remain available for case integrity');
  assert.strictEqual(retainedReport.user, null);
  assert.strictEqual(retainedReport.comments[0].author, null);
});

test('Admin user CRUD updates account data, removes deleted users, and anonymizes report references', async () => {
  const admin = await User.create({
    name: 'Account Admin',
    email: 'account-admin@example.com',
    password: 'StrongPassw0rd!',
    role: 'admin'
  });
  const login = await loginAsAdmin(admin.email, 'StrongPassw0rd!');
  assert.strictEqual(login.status, 200);
  const cookie = login.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];

  const created = await request(app)
    .post('/api/users')
    .set('Cookie', cookie)
    .send({
      name: 'Managed Reviewer',
      email: 'managed-reviewer@example.com',
      password: 'StrongPassw0rd!',
      role: 'reviewer'
    });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.body.role, 'reviewer');
  assert.strictEqual(created.body.password, undefined);

  const userId = created.body.id;
  const user = await User.findById(userId);
  const report = await Report.create({
    trackingReference: 'KW-USER01',
    title: 'User relation test',
    reportedCategory: 'Bribery',
    description: 'Verifies report relations survive account removal.',
    county: 'Nairobi',
    subCounty: 'Westlands',
    user: user._id,
    claimedBy: user._id,
    archivedBy: user._id,
    statusHistory: [{ status: 'In Review', changedBy: user._id }],
    comments: [{ author: user._id, text: 'Reviewer note' }]
  });
  const otherUser = await User.create({
    name: 'Unrelated Account',
    email: 'unrelated-account@example.com',
    password: 'StrongPassw0rd!'
  });
  const otherReport = await Report.create({
    trackingReference: 'KW-USER02',
    title: 'Other user relation test',
    reportedCategory: 'Bribery',
    description: 'Verifies deleting one account preserves other account references.',
    county: 'Nairobi',
    subCounty: 'Westlands',
    user: otherUser._id,
    claimedBy: user._id,
    archivedBy: otherUser._id,
    statusHistory: [
      { status: 'Received', changedBy: otherUser._id },
      { status: 'In Review', changedBy: user._id }
    ],
    comments: [
      { author: otherUser._id, text: 'Other reviewer note' },
      { author: user._id, text: 'Reviewer note' }
    ]
  });

  const updated = await request(app)
    .patch(`/api/users/${userId}`)
    .set('Cookie', cookie)
    .send({ name: 'Updated Reviewer', email: 'updated-reviewer@example.com' });
  assert.strictEqual(updated.status, 200);
  assert.strictEqual(updated.body.name, 'Updated Reviewer');
  assert.strictEqual(updated.body.email, 'updated-reviewer@example.com');

  const promoted = await request(app)
    .patch(`/api/users/${userId}/role`)
    .set('Cookie', cookie)
    .send({ role: 'admin' });
  assert.strictEqual(promoted.status, 403);
  assert.strictEqual((await User.findById(userId)).role, 'reviewer');

  const listed = await request(app).get('/api/users').set('Cookie', cookie);
  const listedUser = listed.body.find((item) => item._id === userId);
  assert.ok(listedUser);
  assert.strictEqual(listedUser.password, undefined);

  const deleted = await request(app).delete(`/api/users/${userId}`).set('Cookie', cookie);
  assert.strictEqual(deleted.status, 204);
  assert.strictEqual(await User.findById(userId), null);
  const retainedReport = await Report.findById(report._id);
  assert.strictEqual(retainedReport.user, null);
  assert.strictEqual(retainedReport.claimedBy, null);
  assert.strictEqual(retainedReport.archivedBy, null);
  assert.strictEqual(retainedReport.statusHistory[0].changedBy, null);
  assert.strictEqual(retainedReport.comments[0].author, null);
  const retainedOtherReport = await Report.findById(otherReport._id);
  assert.strictEqual(retainedOtherReport.user.toString(), otherUser._id.toString());
  assert.strictEqual(retainedOtherReport.claimedBy, null);
  assert.strictEqual(retainedOtherReport.archivedBy.toString(), otherUser._id.toString());
  assert.strictEqual(retainedOtherReport.statusHistory[0].changedBy.toString(), otherUser._id.toString());
  assert.strictEqual(retainedOtherReport.statusHistory[1].changedBy, null);
  assert.strictEqual(retainedOtherReport.comments[0].author.toString(), otherUser._id.toString());
  assert.strictEqual(retainedOtherReport.comments[1].author, null);
  assert.ok((await request(app).get('/api/users').set('Cookie', cookie)).body.every((item) => item._id !== userId));
  await User.deleteOne({ _id: admin._id });
  await User.deleteOne({ _id: otherUser._id });
});

test('Admins cannot delete themselves or remove the last Admin', async () => {
  const admin = await User.create({
    name: 'Sole Admin',
    email: 'sole-admin@example.com',
    password: 'StrongPassw0rd!',
    role: 'admin'
  });
  const login = await loginAsAdmin(admin.email, 'StrongPassw0rd!');
  assert.strictEqual(login.status, 200);
  const cookie = login.headers['set-cookie'].find((value) => value.startsWith('kw_token=')).split(';')[0];

  const selfDelete = await request(app).delete(`/api/users/${admin._id}`).set('Cookie', cookie);
  assert.strictEqual(selfDelete.status, 409);

  const demoteAdmin = await request(app)
    .patch(`/api/users/${admin._id}/role`)
    .set('Cookie', cookie)
    .send({ role: 'reviewer' });
  assert.strictEqual(demoteAdmin.status, 409);

  const deleteLastAdmin = await request(app).delete(`/api/users/${admin._id}`).set('Cookie', cookie);
  assert.strictEqual(deleteLastAdmin.status, 409);
  assert.ok(await User.findById(admin._id));
});
