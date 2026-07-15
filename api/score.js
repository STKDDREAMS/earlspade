// api/score.js
// Vercel serverless function (Node.js). Saves a game score to the GLOBAL
// leaderboard, stored in Upstash Redis as a sorted set — ranking is automatic.
//
// ---------------------------------------------------------------------------
// ONE-TIME SETUP (about 2 minutes):
//   1. Vercel dashboard -> your project -> Storage tab -> Create Database
//      -> pick "Upstash" (Redis, from the Marketplace) -> create the store.
//   2. Connect the store to this project when prompted. Vercel injects the
//      credentials as environment variables automatically — nothing to copy.
//   3. Redeploy the project once so the functions pick up the new env vars.
//
// ENV VARS THIS CODE EXPECTS (either pair works — Vercel injects one of them
// depending on the integration version):
//   UPSTASH_REDIS_REST_URL  + UPSTASH_REDIS_REST_TOKEN
//   KV_REST_API_URL         + KV_REST_API_TOKEN
//
// Until the store exists, this endpoint answers 503 and the game shows
// "leaderboard offline" — everything else keeps working.
// ---------------------------------------------------------------------------

const LB_KEY      = 'lb:v1';         // the sorted set holding "name -> best score"
const CONTACT_KEY = 'lb:contact:v1'; // hash "name -> email" — the gift list.
                                     // PRIVATE: /api/leaderboard never reads this
                                     // key, so emails can never reach the client.
const MAX_SCORE = 20000;    // light anti-cheat: reject absurd scores
const MAX_KEEP  = 100;      // keep the set small (top 100 is plenty)

function upstash(){
  const url   = process.env.UPSTASH_REDIS_REST_URL  || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if(!url || !token) return null;
  // Upstash REST: POST the command as a JSON array, e.g. ["ZADD","k","GT","1","a"]
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

// name rules: strip HTML-ish and control characters, collapse whitespace,
// 1..16 chars after trimming.
function cleanName(raw){
  if(typeof raw !== 'string') return null;
  const name = raw
    .replace(/[<>&"'`]/g, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  return name.length >= 1 ? name : null;
}

// email rules: trimmed, lowercased, sane shape, sane length.
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
  const name  = cleanName(body && body.name);
  const email = cleanEmail(body && body.email);
  const score = body && body.score;
  if(!name || !email || !Number.isInteger(score) || score < 1 || score > MAX_SCORE){
    res.status(400).json({ ok: false, error: 'invalid' });
    return;
  }

  try{
    // GT = only update if the new score is GREATER: each name keeps its best.
    await redis(['ZADD', LB_KEY, 'GT', String(score), name]);
    // remember how to reach this player (kept server-side only; latest wins)
    await redis(['HSET', CONTACT_KEY, name, email]);
    // trim everything below the top MAX_KEEP
    await redis(['ZREMRANGEBYRANK', LB_KEY, '0', String(-(MAX_KEEP + 1))]);
    res.status(200).json({ ok: true });
  }catch(e){
    res.status(503).json({ ok: false, offline: true });
  }
};
