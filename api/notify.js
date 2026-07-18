// api/notify.js
// Vercel serverless function (Node.js). Saves a waitlist signup — restock
// alerts on sold-out pieces, the Series 3 list, or the seasonal letter —
// into Upstash Redis. Same store and env-var setup as api/score.js.
//
// ENV VARS (either pair, injected by the Vercel/Upstash integration):
//   UPSTASH_REDIS_REST_URL  + UPSTASH_REDIS_REST_TOKEN
//   KV_REST_API_URL         + KV_REST_API_TOKEN
//
// PRIVATE: nothing ever reads this key back to the client — there is no
// GET here and no other endpoint touches it. Emails stay server-side.

const NOTIFY_KEY = 'notify:v1';   // hash "email -> {interests, at}"
const INTERESTS = ['restock', 'series3', 'letter'];

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

// email rules: trimmed, lowercased, sane shape, sane length (same as score.js)
function cleanEmail(raw){
  if(typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase().slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
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
  const email    = cleanEmail(body && body.email);
  const interest = body && body.interest;
  if(!email || !INTERESTS.includes(interest)){
    res.status(400).json({ ok: false, error: 'invalid' });
    return;
  }

  try{
    // merge interests per email so one address can sit on several lists
    const prev = await redis(['HGET', NOTIFY_KEY, email]);
    let interests = [interest];
    if(prev){
      try{
        const old = JSON.parse(prev);
        interests = Array.from(new Set([...(old.interests || []), interest]));
      }catch(e){}
    }
    await redis(['HSET', NOTIFY_KEY, email,
      JSON.stringify({ interests, at: Date.now() })]);
    res.status(200).json({ ok: true });
  }catch(e){
    res.status(503).json({ ok: false, offline: true });
  }
};
