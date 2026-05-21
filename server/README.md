Focus Forge - local dev server

Prerequisites
- Node.js 16+

Install

```bash
cd server
npm install
```

Run (development)

```bash
PORT=3000 node index.js
```

Optional environment variables
- `STRIPE_SECRET` - your Stripe secret key (test key OK)
- `STRIPE_WEBHOOK_SECRET` - webhook signing secret (optional)
- `SESSION_SECRET` - session secret

Notes
- This is a minimal scaffold for local testing: local sign-in creates a simple account stored in `db.json`.
- Checkout will return a mock URL if `STRIPE_SECRET` is not set.

Security hardening notes
- The server now includes Helmet for secure headers and a basic rate limiter on `/api/*` endpoints.
- Session cookies use `httpOnly` and `sameSite=lax`. Set `NODE_ENV=production` and `TRUST_PROXY=1` when deploying behind a proxy to enable secure cookies.
- CORS is restricted by `CORS_ORIGIN` env var (defaults to `http://localhost:3000`).
- JSON body size is limited to `100kb`.

Stripe CLI (local webhook testing)
- Install the Stripe CLI: https://stripe.com/docs/stripe-cli
- Start your local server: `PORT=3000 node index.js`
- Forward events to your local webhook endpoint:

```bash
stripe listen --forward-to localhost:3000/webhook
```

- Create a test Checkout Session via the app and watch the forwarded events arrive.

Developer webhook simulation (no Stripe)
- For quick testing without Stripe, POST a `checkout.session.completed`-shaped JSON to `/webhook` and the server will award coins when `metadata.userId` is present.

Example (curl):

```bash
curl -X POST http://localhost:3000/webhook -H "Content-Type: application/json" -d '{"type":"checkout.session.completed","data":{"object":{"id":"sess_123","amount_total":499,"metadata":{"userId":"<USER_ID>","pack":"coins_500"}}}}'
```


Webhook and awarding coins
- When Stripe is configured, the server attaches `userId` and `pack` metadata to the Checkout Session. The webhook endpoint (`/webhook`) listens for `checkout.session.completed` and awards coins to the matching user in `db.json`.
- For local testing without Stripe, you can simulate a webhook by manually adding a purchase to `db.json` or by setting `STRIPE_SECRET` and using the Stripe CLI to forward events.
