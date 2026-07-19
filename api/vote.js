// api/vote.js
// Vercel serverless function (Node.js). Counts a series-3 direction vote
// in Upstash Redis. Same store and env-var setup as api/score.js.
//
// ENV VARS (either pair, injected by the Vercel/Upstash integration):
//   UPSTASH_REDIS_REST_URL  + UPSTASH_REDIS_REST_TOKEN
//   KV_REST_API_URL         + KV_REST_API_TOKEN
//
// PRIVATE: counts only, no GET — results are read straight from the
// store by the shop, never by the client.

const VOTE_KEY = 'vote:s3:v1';   // hash "choice -> count"
const CHOICES = ['sky', 'deep', 'garden', 'desert'];

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
  if(req.method !== 'POST'){
    res.status(405).json({ ok: false, error: 'method' });
    return;
  }
  const redis = upstash();
  if(!redis){
    res.status(503).json({ ok: false, offline: true });
    return;
  }

  let body = req.body;
  if(typeof body === 'string'){ try{ body = JSON.parse(body); }catch(e){ body = null; } }
  const choice = body && body.choice;
  if(!CHOICES.includes(choice)){
    res.status(400).json({ ok: false, error: 'invalid' });
    return;
  }

  try{
    await redis(['HINCRBY', VOTE_KEY, choice, '1']);
    res.status(200).json({ ok: true });
  }catch(e){
    res.status(503).json({ ok: false, offline: true });
  }
};
