# Focus Forge

A local-first Pomodoro workspace that can run as a web app, installable PWA, desktop app, or mobile app wrapper.

## Install

Install dependencies:

```
npm install
```

## Run

Start the app:

```
npm start
```

## Files of Interest

- `app.js`, `app.min.js` — main scripts
- `index.html` — entry page
- `styles.css` — styles
- `server/` — local server files

## Contributing

Feel free to open issues or PRs.

## License

MIT

## Usage

Open `index.html` in a browser or serve the folder with a static server:

```
npx serve .
```

## Features

- Polished focus-first interface with responsive layouts for desktop and mobile.
- PWA support with offline assets, a manifest, and a service worker.
- Optional Node server in `server/` for sync, sign-in, and purchase flows.
- Precompressed assets available (`.br` files) for efficient delivery.
