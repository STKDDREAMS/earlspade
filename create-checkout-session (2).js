// api/create-checkout-session.js
// Vercel serverless function (Node.js). Creates a Stripe Checkout Session from
// the cart the browser posts, using the Stripe Price IDs of products you've
// already created in your Stripe Dashboard.
//
// The browser sends:  { cart: { "<item-id>": <quantity>, ... } }

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ---------------------------------------------------------------------------
// Map each SITE product id  ->  its STRIPE Price ID (looks like "price_1Q...").
//
// Find them in: Stripe Dashboard -> Products -> click a product -> Pricing ->
// the "..." menu next to the price -> "Copy price ID".
//
// NOTE: Test mode and Live mode have DIFFERENT price IDs. Use your test-mode
// ids while testing, then swap to the live-mode ids when you go live.
//
// The site ids below must match the `id:` you gave each item in the DROPS
// array in earlspade.html. Paste your real price_... values over REPLACE_ME.
// Leave an item as REPLACE_ME and it will simply be skipped at checkout.
// ---------------------------------------------------------------------------
// Your two Stripe products (each a $20 price).
// If I've got these flipped, just swap the two ids below — nothing else changes.
const STAR = 'price_1TmUc57yMgtYJR2SFeimvdgl'; // "star" product -> Celestial Series (cel-*)
const SEA  = 'price_1TmUbf7yMgtYJR2SOGyhEWgq'; // "sea"  product -> Sea Series (sea-*)

const PRICES = {
  'sea-tidal-crewneck':      SEA,
  'sea-current-pocket-tee':  SEA,
  'sea-deep-pleated-trouser':SEA,
  'sea-harbor-beanie':       SEA,
  'sea-coral-knit-polo':     SEA,
  'sea-drift-chore-coat':    SEA,
  'sea-saltwash-tote':       SEA,
  'sea-anchor-card-holder':  SEA,
  'cel-nebula-hoodie':       STAR,
  'cel-orbit-box-tee':       STAR,
  'cel-eclipse-cargo-pant':  STAR,
  'cel-star-chart-cap':      STAR,
  'cel-lunar-knit-crew':     STAR,
  'cel-meteor-work-jacket':  STAR,
  'cel-astral-long-sleeve':  STAR,
  'cel-cosmos-socks':        STAR,
};

async function readBody(req) {
  if (req.body) {
    if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
    return req.body;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { cart } = await readBody(req);
    const entries = cart && typeof cart === 'object' ? Object.entries(cart) : [];

    const line_items = [];
    for (const [id, rawQty] of entries) {
      const price = PRICES[id];
      if (!price || price.startsWith('price_REPLACE')) continue; // skip unmapped ids
      const quantity = Math.max(1, Math.min(20, parseInt(rawQty, 10) || 0));
      line_items.push({ price, quantity });
    }

    if (line_items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty or no valid products' });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
      // Collect a US shipping address. Edit the country list or remove this line.
      shipping_address_collection: { allowed_countries: ['US'] },
      // automatic_tax: { enabled: true }, // enable after turning on Stripe Tax
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: 'Checkout failed' });
  }
};
