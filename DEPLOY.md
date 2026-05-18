Deployment notes — compression, caching, and hosting

Summary
- Precompressed files were created: `app.min.js.gz`, `app.min.js.br`, `styles.css.gz`, `styles.css.br` (see `scripts/precompress.js`). Use these on your production host to serve compressed assets and reduce transfer size.

Quick server guidance (nginx)
- Use this snippet to serve precompressed Brotli (`.br`) or gzip (`.gz`) when the client supports them, and to add a long cache TTL for static assets:

```
location ~* \.(js|css)$ {
  add_header Vary Accept-Encoding;

  # Prefer Brotli when available
  if ($http_accept_encoding ~ "br") {
    add_header Content-Encoding br;
    try_files $uri.br $uri =404;
  }

  # Fallback to gzip
  if ($http_accept_encoding ~ "gzip") {
    add_header Content-Encoding gzip;
    try_files $uri.gz $uri =404;
  }

  # Default: serve the plain file
  try_files $uri =404;

  # Long cache for immutable static assets
  add_header Cache-Control "public, max-age=31536000, immutable";
}

# Serve HTML without long cache
location = /index.html {
  add_header Cache-Control "public, max-age=0, must-revalidate";
}
```

Notes for common hosts
- Netlify / Vercel: they automatically compress and set cache headers for static deployments. Upload the precompressed files optionally; these hosts typically handle compression for you.
- S3 + CloudFront: enable `Content-Encoding` responses (CloudFront can serve precompressed objects if you upload them and set metadata).

How to precompress locally (already done)
- Run:

```
node scripts/precompress.js
```

How to minify (already done)
- One-liner to minify `app.js` to `app.min.js`:

```
npx terser app.js -c -m -o app.min.js
```

Verify server is serving compressed assets
- Use `curl` to check which encoding the server returns:

```
curl -H "Accept-Encoding: br,gzip" -I https://your-site.example/app.min.js

# Look for: Content-Encoding: br  (or gzip)
```

Re-running audits locally
- Lighthouse (headless):

```
npx -y lighthouse http://127.0.0.1:5000 --output json --output-path=./lighthouse-report-after-compress.json --chrome-flags="--headless" --quiet --no-enable-error-reporting
```

- Axe (automated):

```
npx -y @axe-core/cli http://127.0.0.1:5000 --save=axe-report.json
```

Notes and next steps
- Adding compression + long cache TTLs is the fastest, highest-impact change to reduce transfer sizes.
- In production, also enable server-side compression (gzip/brotli) or let CDN handle it.
- If you want, I can re-run Lighthouse now to capture the delta after these local optimizations.

Files to review in this repo
- [scripts/precompress.js](scripts/precompress.js#L1)
- [app.min.js](app.min.js)
- [styles.css](styles.css)
