const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const DB_PATH = path.join(__dirname, 'db.json');

function readDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    return { users: [], purchases: [] };
  }
}

function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

const db = readDB();

const app = express();
const PORT = process.env.PORT || 3000;

// Serve the app static files from parent folder so the site can be served from the server
app.use(express.static(path.join(__dirname, '..')));

// Security middleware
app.use(helmet());

// Trust proxy (for secure cookies behind proxies like Heroku)
if (process.env.TRUST_PROXY === '1' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Limit request size for JSON bodies
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Basic rate limiting for API endpoints
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
app.use('/api/', apiLimiter);

// Optional: passport-based Google OAuth
let passport;
try {
  passport = require('passport');
  const GoogleStrategy = require('passport-google-oauth20').Strategy;
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.serializeUser((user, done) => done(null, user.id));
    passport.deserializeUser((id, done) => {
      const u = db.users.find((x) => x.id === id) || null;
      done(null, u);
    });

    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK || `http://localhost:${PORT}/auth/google/callback`
    }, (accessToken, refreshToken, profile, done) => {
      // find or create user
      const email = (profile.emails && profile.emails[0] && profile.emails[0].value) || null;
      const user = ensureUserByEmail(email || `google:${profile.id}`);
      return done(null, user);
    }));

    app.use(passport.initialize());
    app.use(passport.session());

    app.get('/auth/google', passport.authenticate('google', { scope: ['email', 'profile'] }));

    app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/?auth=fail' }), (req, res) => {
      // ensure session user is set
      if (req.user && req.user.id) req.session.userId = req.user.id;
      res.redirect('/?auth=success');
    });
  }
} catch (e) {
  // passport not installed or not configured; ignore
}

// Tighten CORS — default to local dev origin unless configured
const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
app.use(cors({ origin: allowedOrigin, credentials: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax'
  }
}));

function ensureUserByEmail(email) {
  let user = db.users.find((u) => u.email === email);
  if (!user) {
    user = { id: String(Date.now()) + '-' + Math.random().toString(16).slice(2), email, createdAt: new Date().toISOString(), runtime: null };
    db.users.push(user);
    writeDB(db);
  }
  return user;
}

function validateEmail(email) {
  return typeof email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function sanitizeEmail(email) {
  try {
    return String(email).trim().toLowerCase();
  } catch (e) { return '' }
}

function sanitizeRuntime(runtime) {
  if (!runtime || typeof runtime !== 'object') return null;
  const allowed = {};
  allowed.dateKey = typeof runtime.dateKey === 'string' ? runtime.dateKey : getDateKey();
  allowed.sessionType = SESSION_TYPES[runtime.sessionType] ? runtime.sessionType : 'work';
  allowed.isRunning = Boolean(runtime.isRunning);
  allowed.remainingMs = clampNumber(runtime.remainingMs, 0, 24 * 60 * 60 * 1000, getDurationFromSettings(allowed.sessionType));
  allowed.startedAt = typeof runtime.startedAt === 'string' ? runtime.startedAt : null;
  allowed.completedToday = clampNumber(runtime.completedToday, 0, 999, 0);
  allowed.cycleCount = clampNumber(runtime.cycleCount, 0, 999, 0);
  allowed.streak = clampNumber(runtime.streak, 0, 9999, 0);
  allowed.coins = clampNumber(runtime.coins, 0, 999999, 0);
  allowed.distractionCount = clampNumber(runtime.distractionCount, 0, 9999, 0);
  allowed.activeTaskId = typeof runtime.activeTaskId === 'string' ? runtime.activeTaskId : null;
  allowed.breakBonusMinutes = clampNumber(runtime.breakBonusMinutes, 0, 120, 0);
  allowed.focusBoostSessions = clampNumber(runtime.focusBoostSessions, 0, 24, 0);
  return allowed;
}

app.post('/api/local-signin', (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string') return res.status(400).json({ error: 'Email required' });
  const clean = sanitizeEmail(email);
  if (!validateEmail(clean)) return res.status(400).json({ error: 'Invalid email' });
  const user = ensureUserByEmail(clean);
  req.session.userId = user.id;
  res.json({ user });
});

app.get('/api/auth-config', (req, res) => {
  res.json({ google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) });
});

app.post('/api/signout', (req, res) => {
  req.session.destroy(() => { res.json({ ok: true }); });
});

app.get('/api/me', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'Not signed in' });
  const user = db.users.find((u) => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

app.post('/api/sync', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'Not signed in' });
  const user = db.users.find((u) => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { runtime } = req.body || {};
  // sanitize runtime before saving
  user.runtime = sanitizeRuntime(runtime) || null;
  user.syncedAt = new Date().toISOString();
  writeDB(db);
  res.json({ runtime: user.runtime });
});

app.get('/api/sync', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'Not signed in' });
  const user = db.users.find((u) => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ runtime: user.runtime });
});

// Checkout - uses Stripe if configured; otherwise returns a mock URL
app.post('/api/checkout', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'Sign in to purchase' });
  const { pack } = req.body || {};
  // map simple packs
  const packMap = {
    coins_500: { amount: 499, label: '500 Coins' }
  };

  const chosen = packMap[pack] || packMap.coins_500;

  const stripeSecret = process.env.STRIPE_SECRET;
  if (!stripeSecret) {
    // Return a mock checkout URL for dev
    return res.json({ url: `https://example.com/mock-checkout?pack=${encodeURIComponent(pack || 'coins_500')}` });
  }

  try {
    const Stripe = require('stripe');
    const stripe = Stripe(stripeSecret);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: chosen.label },
          unit_amount: chosen.amount
        },
        quantity: 1
      }],
      // include user and pack in metadata so webhook can award coins
      metadata: { userId: userId, pack: pack || 'coins_500' },
      success_url: req.body.successUrl || 'http://localhost:3000/?checkout=success',
      cancel_url: req.body.cancelUrl || 'http://localhost:3000/?checkout=cancel'
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout failed', err && err.message);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// Minimal webhook endpoint (raw body required for stripe signature verification)
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const stripeSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeSecret) {
    console.log('Webhook received (no secret configured):', req.body);
    // For development convenience, allow a direct checkout-like JSON payload to trigger awarding
    try {
      let event;
      if (Buffer.isBuffer(req.body)) {
        try { event = JSON.parse(req.body.toString('utf8')); } catch (e) { event = null; }
      } else if (typeof req.body === 'string') {
        try { event = JSON.parse(req.body); } catch (e) { event = null; }
      } else {
        event = req.body;
      }

      if (event && event.type === 'checkout.session.completed') {
        const sessionObj = event.data && event.data.object ? event.data.object : {};
        const metadata = sessionObj.metadata || {};
        const uid = metadata.userId;
        const packKey = metadata.pack || 'coins_500';
        const packAwardMap = { coins_500: 500 };
        const user = db.users.find((u) => u.id === uid);
        if (user) {
          user.runtime = user.runtime || {};
          user.runtime.coins = (Number(user.runtime.coins) || 0) + (packAwardMap[packKey] || 0);
          const purchase = { id: String(Date.now()) + '-' + Math.random().toString(16).slice(2), userId: uid, pack: packKey, amount: sessionObj.amount_total || 0, createdAt: new Date().toISOString(), stripeId: sessionObj.id };
          db.purchases.push(purchase);
          writeDB(db);
          console.log(`(dev) Awarded ${packAwardMap[packKey] || 0} coins to user ${uid}`);
        }
      }
    } catch (e) {
      // ignore parse errors
    }
    return res.json({ received: true });
  }

  try {
    const Stripe = require('stripe');
    const stripe = Stripe(process.env.STRIPE_SECRET);
    const event = stripe.webhooks.constructEvent(req.body, sig, stripeSecret);
    console.log('Webhook event:', event.type);

    if (event.type === 'checkout.session.completed') {
      const sessionObj = event.data.object;
      const metadata = sessionObj.metadata || {};
      const uid = String(metadata.userId || '').trim();
      const packKey = metadata.pack || 'coins_500';
      const packAwardMap = { coins_500: 500 };

      const user = db.users.find((u) => u.id === uid);
      if (user) {
        // Ensure runtime exists
        user.runtime = user.runtime || {};
        user.runtime.coins = (Number(user.runtime.coins) || 0) + (packAwardMap[packKey] || 0);
        const purchase = { id: String(Date.now()) + '-' + Math.random().toString(16).slice(2), userId: uid, pack: packKey, amount: sessionObj.amount_total || 0, createdAt: new Date().toISOString(), stripeId: sessionObj.id };
        db.purchases.push(purchase);
        writeDB(db);
        console.log(`Awarded ${packAwardMap[packKey] || 0} coins to user ${uid}`);
      } else {
        console.warn('Webhook: user not found for checkout session metadata', uid);
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook signature verification failed', err && err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`Focus Forge server running on http://localhost:${PORT}`);
});
