// api/leaderboard.js
// Vercel serverless function (Node.js). Returns the global top 10 as
// [{ rank, name, score }] from the Upstash Redis sorted set.
//
// Setup lives in api/score.js — same store, same env vars:
//   UPSTASH_REDIS_REST_URL  + UPSTASH_REDIS_REST_TOKEN   (or)
//   KV_REST_API_URL         + KV_REST_API_TOKEN
// Until the store is provisioned this answers 503 and the game shows
// "leaderboard offline".

const LB_KEY = 'lb:v1';

function upstash(){
  const url   = process.env.UPSTASH_REDIS_REST_URL  || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if(!url || !token) return null;
  return async (cmd) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    if(!res.ok) throw new Error(`upstash ${res.status}`);
    return (await res.json()).result;
  };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if(req.method !== 'GET'){
    res.status(405).json({ offline: false, error: 'method' });
    return;
  }
  const redis = upstash();
  if(!redis){
    res.status(503).json({ offline: true });
    return;
  }
  try{
    // flat [member, score, member, score, ...] — highest first
    const flat = await redis(['ZREVRANGE', LB_KEY, '0', '9', 'WITHSCORES']);
    const rows = [];
    for(let i = 0; i < flat.length; i += 2){
      rows.push({ rank: rows.length + 1, name: String(flat[i]), score: parseInt(flat[i + 1], 10) });
    }
    res.status(200).json(rows);
  }catch(e){
    res.status(503).json({ offline: true });
  }
};
