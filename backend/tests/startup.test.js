const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// The other tests load app.js directly, so a syntax error in the server entry
// point or a maintenance script would slip through. This parses every one.
test('the server entry point and every script parse', () => {
  const root = path.join(__dirname, '..');
  const files = ['index.js', ...fs.readdirSync(path.join(root, 'scripts')).filter((f) => f.endsWith('.js')).map((f) => path.join('scripts', f))];
  for (const file of files) {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' }), `${file} must parse`);
  }
});
