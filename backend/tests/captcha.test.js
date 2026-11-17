const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const { buildCells, generateImageChallenge, verifyImageSelection } = require('../utils/imageCaptcha');
const { verifyChallenge } = require('../utils/captcha');

test('image challenge decoys never include the requested target', () => {
  const targets = ['bus', 'trafficLight', 'bicycle', 'cat', 'tree', 'house'];
  for (const target of targets) {
    for (let targetCount = 2; targetCount <= 5; targetCount += 1) {
      const cells = buildCells(target, targetCount, () => 0);
      assert.equal(cells.length, 9);
      assert.equal(cells.filter((cell) => cell === target).length, targetCount);
      assert.ok(cells.slice(targetCount).every((cell) => cell !== target));
    }
  }
});

test('image tokens require the exact answer and can only be consumed once', () => {
  const challenge = generateImageChallenge();
  assert.equal(challenge.tiles.length, 9);
  const ids = Array.from({ length: 9 }, (_, index) => index);
  let answer;
  for (let size = 2; size <= 5 && !answer; size += 1) {
    const search = (start, selected) => {
      if (selected.length === size) {
        if (verifyImageSelection(challenge.token, selected)) answer = selected;
        return;
      }
      for (
        let index = start;
        index <= ids.length - (size - selected.length) && !answer;
        index += 1
      ) {
        search(index + 1, [...selected, ids[index]]);
      }
    };
    search(0, []);
  }

  assert.ok(answer, 'challenge should have one valid tile set');
  assert.equal(verifyChallenge(challenge.token, JSON.stringify(answer)), true);
  assert.equal(verifyChallenge(challenge.token, JSON.stringify(answer)), false);

  const unusedChallenge = generateImageChallenge();
  const wrongAnswer = answer.slice(1);
  assert.equal(verifyChallenge(unusedChallenge.token, JSON.stringify(wrongAnswer)), false);
});
