const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('../../backend/node_modules/mongoose');
const Report = require('../../backend/report.model');
const { CATEGORIES } = require('../../backend/utils/categories');
const { normaliseForMatching } = require('../../backend/utils/kenyaLingo');

const ML_ROOT = path.resolve(__dirname, '..');
const APPROVAL_ROOT = path.resolve(ML_ROOT, 'data', 'approved');
const RAW_ROOT = path.resolve(ML_ROOT, 'data', 'raw');
const MAX_REPORTS = 5000;

function parseArguments(args) {
  const options = { writeRaw: false, confirmed: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--approval-file' && args[index + 1]) {
      options.approvalFile = args[++index];
    } else if (argument === '--write-raw') {
      options.writeRaw = true;
    } else if (argument === '--confirm-sensitive-export') {
      options.confirmed = true;
    } else if (argument === '--help') {
      options.help = true;
    } else {
      throw new Error(`Unknown or incomplete option: ${argument}`);
    }
  }
  if (!options.help && !options.approvalFile) {
    throw new Error('Specify a local approval manifest with --approval-file.');
  }
  if (options.writeRaw && !options.confirmed) {
    throw new Error('Raw export requires both --write-raw and --confirm-sensitive-export.');
  }
  if (options.confirmed && !options.writeRaw) {
    throw new Error('--confirm-sensitive-export is only valid with --write-raw.');
  }
  return options;
}

function parseApprovalManifest(content) {
  const ids = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  if (!ids.length) throw new Error('The approval manifest contains no report IDs.');
  if (ids.length > MAX_REPORTS) throw new Error(`The manifest may contain at most ${MAX_REPORTS} report IDs.`);
  if (ids.some((id) => !/^[a-f\d]{24}$/i.test(id))) {
    throw new Error('The approval manifest contains an invalid report ID.');
  }
  if (new Set(ids.map((id) => id.toLowerCase())).size !== ids.length) {
    throw new Error('The approval manifest contains duplicate report IDs.');
  }
  return ids;
}

function resolveApprovedLabel(report) {
  const review = report.categoryReview || {};
  const category = review.adjudicatedCategory;
  const decision = review.adjudicatedDecision || (category ? 'category' : null);
  const isFinalized = review.status === 'agreed' || review.status === 'adjudicated';
  if (isFinalized && decision === 'category' && CATEGORIES.includes(category)) return category;
  return null;
}

function buildIncidentGroupIds(reports, secret) {
  const selectedIds = new Set(reports.map((report) => report._id.toString()));
  const parent = new Map([...selectedIds].map((id) => [id, id]));
  const find = (id) => {
    const currentParent = parent.get(id);
    if (currentParent !== id) parent.set(id, find(currentParent));
    return parent.get(id);
  };
  const union = (first, second) => {
    if (!selectedIds.has(first) || !selectedIds.has(second)) return;
    const firstRoot = find(first);
    const secondRoot = find(second);
    if (firstRoot !== secondRoot) parent.set(secondRoot, firstRoot);
  };

  for (const report of reports) {
    for (const relatedId of report.relatedCaseLinks || []) {
      union(report._id.toString(), relatedId.toString());
    }
  }

  const componentMembers = new Map();
  for (const id of selectedIds) {
    const root = find(id);
    if (!componentMembers.has(root)) componentMembers.set(root, []);
    componentMembers.get(root).push(id);
  }
  const hashByRoot = new Map();
  for (const [root, members] of componentMembers) {
    const digest = crypto.createHmac('sha256', secret).update(members.sort().join('\n')).digest('hex');
    hashByRoot.set(root, `incident-${digest.slice(0, 24)}`);
  }
  return new Map([...selectedIds].map((id) => [id, hashByRoot.get(find(id))]));
}

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function createCsv(rows) {
  const header = ['text', 'label', 'group_id'].map(csvCell).join(',');
  const body = rows.map((row) => [
    row.text,
    row.label,
    row.group_id
  ].map(csvCell).join(','));
  return `${[header, ...body].join('\r\n')}\r\n`;
}

function approvalFilePath(inputPath) {
  const absolutePath = path.resolve(inputPath);
  const relativePath = path.relative(APPROVAL_ROOT, absolutePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Approval manifest must be stored inside ${APPROVAL_ROOT}.`);
  }
  return absolutePath;
}

async function loadDotEnv() {
  const dotenvPath = path.resolve(ML_ROOT, '..', 'backend', '.env');
  if (fs.existsSync(dotenvPath)) {
    require(path.resolve(ML_ROOT, '..', 'backend', 'node_modules', 'dotenv'))
      .config({ path: dotenvPath, quiet: true });
  }
}

async function run(options) {
  const manifestPath = approvalFilePath(options.approvalFile);
  const ids = parseApprovalManifest(fs.readFileSync(manifestPath, 'utf8'));
  await loadDotEnv();
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not configured.');
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const reports = await Report.find({
      _id: { $in: ids },
      archivedAt: null
    })
      .select('_id title description categoryReview relatedCaseLinks')
      .lean();
    const reportsById = new Map(reports.map((report) => [report._id.toString(), report]));
    const missingIds = ids.filter((id) => !reportsById.has(id));
    if (missingIds.length) {
      throw new Error(`${missingIds.length} approved report ID(s) are missing or archived.`);
    }
    const unlabeled = reports.filter((report) => !resolveApprovedLabel(report));
    if (unlabeled.length) {
      throw new Error(`${unlabeled.length} approved report(s) do not have a finalized category label.`);
    }
    if (options.writeRaw && (!process.env.ML_GROUP_HASH_KEY || process.env.ML_GROUP_HASH_KEY.length < 32)) {
      throw new Error('Set ML_GROUP_HASH_KEY to a secret of at least 32 characters before exporting.');
    }
    const secret = process.env.ML_GROUP_HASH_KEY || crypto.randomBytes(32).toString('hex');
    const groupIds = buildIncidentGroupIds(reports, secret);
    // Kenya-lingo normalisation is applied at export time so the training text
    // uses the same vocabulary as backend/utils/experimentalCategoryModel.js:
    // English, Kiswahili, Sheng and mixed-language reports land in one space.
    const rows = reports.map((report) => ({
      text: normaliseForMatching(`${report.title}\n${report.description}`).trim(),
      label: resolveApprovedLabel(report),
      group_id: groupIds.get(report._id.toString())
    }));
    if (rows.some((row) => !row.text.trim())) throw new Error('An approved report has no usable narrative text.');

    const labelCounts = {};
    for (const row of rows) labelCounts[row.label] = (labelCounts[row.label] || 0) + 1;
    const summary = {
      selectedReports: rows.length,
      distinctIncidentGroups: new Set(rows.map((row) => row.group_id)).size,
      finalizedCategoryCounts: Object.fromEntries(Object.entries(labelCounts).sort(([a], [b]) => a.localeCompare(b))),
      output: options.writeRaw ? 'raw staging CSV written locally' : 'dry run; no report text exported'
    };

    if (options.writeRaw) {
      fs.mkdirSync(RAW_ROOT, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
      const outputPath = path.join(RAW_ROOT, `reviewed-candidate-${timestamp}.csv`);
      const csvContent = createCsv(rows);
      const csvSha256 = crypto.createHash('sha256').update(csvContent).digest('hex');
      const metadata = {
        exportedAt: new Date().toISOString(),
        rowCount: rows.length,
        incidentGroupCount: summary.distinctIncidentGroups,
        finalizedCategoryCounts: summary.finalizedCategoryCounts,
        csvSha256,
        note: 'Sensitive raw staging file. Review and de-identify manually; not approved for training.'
      };
      const metadataPath = outputPath.replace(/\.csv$/, '.metadata.json');
      try {
        fs.writeFileSync(outputPath, csvContent, { encoding: 'utf8', flag: 'wx' });
        fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      } catch (error) {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);
        throw error;
      }
      summary.output = path.relative(ML_ROOT, outputPath);
    }
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node ml/scripts/export-reviewed-dataset.js --approval-file ml/data/approved/report_ids.txt [--write-raw --confirm-sensitive-export]');
      return;
    }
    await run(options);
  } catch (error) {
    console.error(`Dataset export stopped: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  approvalFilePath,
  buildIncidentGroupIds,
  createCsv,
  parseApprovalManifest,
  parseArguments,
  resolveApprovedLabel
};
