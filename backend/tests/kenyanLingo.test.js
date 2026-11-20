// Regression tests for Kenyan-language triage.
//
// Every case below is a sentence a Kenyan reporter could plausibly write. They were
// written to pin down three failures found while testing Sheng text by hand:
//   1. a plain-English demand was scored as Other because it never said "bribe";
//   2. a Sheng extortion ("or I'll cut you") was scored as bribery, because the
//      refusal was mapped but the threat was not;
//   3. Sheng money words (mullah, doo) were neutral, so embezzlement lost
//      its only signal and fell to Other.
// If a future change to the glossary breaks these, the test says which sentence.
const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyReportText } = require("../utils/classifier");
const { normaliseForMatching } = require("../utils/kenyaLingo");

function categoryOf(description, title = "") {
  return classifyReportText({ title, description, evidenceCount: 0 }).category;
}

test("plain English demand for money is triaged as bribery", () => {
  const text =
    "An officer at the county office demanded 5000 shillings to renew my business permit.";
  assert.equal(categoryOf(text), "Bribery");
});

test("Kiswahili demand with rushwa is triaged as bribery", () => {
  assert.equal(
    categoryOf(
      "Afisa wa wilaya alidai rushwa kabla ya kunipa kibali cha biashara.",
    ),
    "Bribery",
  );
});

test("Sheng kitu kidogo is triaged as bribery", () => {
  const text =
    "Nikiwa kwa ofisi ya lands, afisa aliniambia nilete kitu kidogo ndio apige stempu kwa title yangu.";
  assert.equal(categoryOf(text), "Bribery");
});

test("Sheng hongo with an amount is triaged as bribery", () => {
  const text =
    "Msee wa kanjo alinidai hongo ya elfu tano kwa day off, akanishow nipige magoti.";
  assert.equal(categoryOf(text), "Bribery");
});

test("Sheng demand backed by a threat is triaged as extortion, not bribery", () => {
  const text =
    "Dere wa mat alitishia kunichoma kisu nikikataa kumtolea chai ya barabara.";
  assert.equal(categoryOf(text), "Extortion");
});

test("English demand backed by a threat is triaged as extortion", () => {
  const text =
    "The officer said he would have me arrested if I refused to pay him for the stamp.";
  assert.equal(categoryOf(text), "Extortion");
});

test("Sheng money terms in a funds-missing narrative are triaged as embezzlement", () => {
  const text = "Mullah za CDF zimepotea, msee alichukua doo zote akapiga nje.";
  assert.equal(categoryOf(text), "Embezzlement");
});

test("Sheng threat phrasing is expanded into an extortion canon before scoring", () => {
  const expanded = normaliseForMatching("alitishia kunichoma kisu nikikataa");
  assert.match(expanded, /extort/);
  assert.match(expanded, /threatened/);
});

test("a demand with no coercion at all stays bribery rather than becoming extortion", () => {
  const text =
    "The clerk asked me to pay something extra before she would stamp my form.";
  assert.equal(categoryOf(text), "Bribery");
});

test("a harm-free police report is not forced into extortion by the word police", () => {
  const text =
    "A police officer at the roadblock was friendly and checked my documents quickly.";
  assert.equal(categoryOf(text), "Other");
});

test("Sheng money words alone do not create a corruption category", () => {
  // "doo" is money but nothing improper is alleged here; the classifier should not
  // invent a category out of ordinary talk about money and a shop.
  const text =
    "Nilikwenda sokoni kununua nyanya na doo zangu ziliisha haraka kabla ya saa moja.";
  const category = categoryOf(text);
  assert.equal(category, "Other");
});

test("everyday Sheng and Kiswahili words do not trigger a corruption category", () => {
  // "manze" means "man/dude", "mchanga" is sand, "hakuna kazi" is "there is no work":
  // none of them is evidence of a bribe or a threat.
  const expanded = normaliseForMatching("Manze, hakuna kazi mtaani na mchanga umejaa barabara.");
  assert.doesNotMatch(expanded, /bribe|extort/);
});
