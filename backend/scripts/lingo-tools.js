// Bridge between the Node Kenya-lingo normaliser and the Python ML workspace, so
// training and evaluation use exactly the same text pipeline as the live service.
//
//   node scripts/lingo-tools.js export-lexicon   -> prints the glossary as JSON
//   node scripts/lingo-tools.js normalise        -> reads a JSON array of strings
//                                                   on stdin, prints the normalised
//                                                   array on stdout
//   node scripts/lingo-tools.js classify         -> reads a JSON array of reports
//                                                   on stdin, prints the keyword
//                                                   classifier's category for each
const { SHENG_AND_DIALECT_TERMS, normaliseForMatching, normalizeText } = require('../utils/kenyaLingo');
const { classifyReportText } = require('../utils/classifier');

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

(async () => {
  const command = process.argv[2];
  if (command === 'export-lexicon') {
    process.stdout.write(JSON.stringify(SHENG_AND_DIALECT_TERMS));
  } else if (command === 'normalise') {
    const texts = JSON.parse(await readStdin());
    process.stdout.write(JSON.stringify(texts.map((text) => normaliseForMatching(text))));
  } else if (command === 'plain') {
    const texts = JSON.parse(await readStdin());
    process.stdout.write(JSON.stringify(texts.map((text) => normalizeText(text))));
  } else if (command === 'classify') {
    const reports = JSON.parse(await readStdin());
    process.stdout.write(JSON.stringify(reports.map((report) => classifyReportText({
      title: report.title || '',
      description: report.description || '',
      evidenceCount: report.evidenceCount || 0,
    }).category)));
  } else {
    console.error('usage: node scripts/lingo-tools.js export-lexicon | normalise | plain | classify');
    process.exit(2);
  }
})();
