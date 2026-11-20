// Copies every collection (including GridFS evidence files and all indexes) from
// the local database in MONGO_URI to the hosted one in ATLAS_URI, both read from
// backend/.env. The source is only read. The copy stops if the target already
// holds data, unless --replace is given.
//
//   node scripts/copy-database.js            copy into an empty target
//   node scripts/copy-database.js --replace  empty the target's collections first
require('dotenv').config({ quiet: true });
const { MongoClient } = require('mongodb');

async function main() {
  const source = process.env.MONGO_URI;
  const target = process.env.ATLAS_URI;
  if (!source || !target) throw new Error('Set MONGO_URI (local) and ATLAS_URI (hosted) in backend/.env.');
  if (source === target) throw new Error('MONGO_URI and ATLAS_URI are the same database.');
  const replace = process.argv.includes('--replace');

  const from = await MongoClient.connect(source);
  const to = await MongoClient.connect(target);
  try {
    const src = from.db();
    const dst = to.db();
    const collections = (await src.listCollections({ type: 'collection' }).toArray())
      .map((c) => c.name)
      .filter((name) => !name.startsWith('system.'));

    const existing = [];
    for (const name of collections) {
      if (await dst.collection(name).estimatedDocumentCount()) existing.push(name);
    }
    if (existing.length && !replace) {
      throw new Error(`The target already has data in: ${existing.join(', ')}. Re-run with --replace to overwrite it.`);
    }

    console.log(`Copying ${src.databaseName} -> ${dst.databaseName} (hosted)`);
    for (const name of collections) {
      const docs = src.collection(name).find();
      const out = dst.collection(name);
      if (replace) await out.deleteMany({});
      let batch = [];
      let count = 0;
      for await (const doc of docs) {
        batch.push(doc);
        if (batch.length === 500) { await out.insertMany(batch, { ordered: false }); count += batch.length; batch = []; }
      }
      if (batch.length) { await out.insertMany(batch, { ordered: false }); count += batch.length; }
      for (const index of await src.collection(name).indexes()) {
        if (index.name === '_id_') continue;
        const { key, v, ns, ...options } = index;
        await out.createIndex(key, options);
      }
      console.log(`  ${name}: ${count}`);
    }
    console.log('Done. The local database was not changed.');
  } finally {
    await from.close();
    await to.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
