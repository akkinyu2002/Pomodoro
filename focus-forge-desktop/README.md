# Focus Forge Desktop

This folder contains a standalone Electron wrapper for the main Focus Forge web app.

It does not modify the original source files. The wrapper copies the web assets into `build/web` and serves them locally inside Electron.

## Install

From this folder:

```bash
npm install
```

## Run

```bash
npm start
```

## Build a Windows app

```bash
npm run build
```

The packaged output is written to `release/`.
