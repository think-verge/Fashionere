const { MongoClient } = require('mongodb');
const uri = "mongodb://devyanshsehgal_db_user:Q03be5pAP7ho8Nxr@ac-qsgrbxo-shard-00-00.0kw3phw.mongodb.net:27017,ac-qsgrbxo-shard-00-01.0kw3phw.mongodb.net:27017,ac-qsgrbxo-shard-00-02.0kw3phw.mongodb.net:27017/Fashionere?ssl=true&replicaSet=atlas-oc97bd-shard-0&authSource=admin&retryWrites=true&w=majority";

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
