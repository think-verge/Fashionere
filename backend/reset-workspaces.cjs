const { MongoClient } = require('mongodb');
const uri = process.env.MONGODB_URI;

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('Fashionere');
    const res = await db.collection('workspaces').updateMany({ status: 'generating' }, { $set: { status: 'ready' } });
    console.log(res);
  } finally {
    await client.close();
  }
}
run().catch(console.dir);
