// Shared password strength policy: passwords must mix character classes, not just
// length, so a single character set (or a word alone) is never accepted.
// Rule: at least 8 characters with at least one uppercase letter, one lowercase
// letter, one number and one special (non-alphanumeric) character.
const PASSWORD_RULES = [
  { test: (p) => p.length >= 8, message: "at least 8 characters" },
  { test: (p) => /[A-Z]/.test(p), message: "an uppercase letter" },
  { test: (p) => /[a-z]/.test(p), message: "a lowercase letter" },
  { test: (p) => /[0-9]/.test(p), message: "a number" },
  {
    test: (p) => /[^A-Za-z0-9]/.test(p),
    message: "a special character (for example !, @, #)",
  },
];

const PASSWORD_ERROR =
  "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number and a special character.";

function passwordIssues(password) {
  if (typeof password !== "string") return ["a password"];
  return PASSWORD_RULES.filter((rule) => !rule.test(password)).map(
    (rule) => rule.message,
  );
}

function isStrongPassword(password) {
  return passwordIssues(password).length === 0;
}

module.exports = {
  PASSWORD_RULES,
  PASSWORD_ERROR,
  passwordIssues,
  isStrongPassword,
};
