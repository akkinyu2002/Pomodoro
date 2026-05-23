const fs = require('fs');
const path = require('path');

const SOURCE_ROOT = path.join(__dirname, '..', '..');
const DEST_ROOT = path.join(__dirname, '..', 'www');
const FILES = [
  'index.html',
  'app.js',
  'app.min.js',
  // do not copy precompressed files to Android assets
  'styles.css',
  // do not copy precompressed files to Android assets
  'sw.js',
  'manifest.webmanifest',
  'offline.html'
];
const DIRECTORIES = ['icons', 'scripts'];

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyPath(sourcePath, destinationPath) {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    ensureDirectory(destinationPath);
    for (const entry of fs.readdirSync(sourcePath)) {
      copyPath(path.join(sourcePath, entry), path.join(destinationPath, entry));
    }
    return;
  }

  ensureDirectory(path.dirname(destinationPath));
  fs.copyFileSync(sourcePath, destinationPath);
}

ensureDirectory(DEST_ROOT);

for (const file of FILES) {
  const sourcePath = path.join(SOURCE_ROOT, file);
  if (fs.existsSync(sourcePath)) {
    copyPath(sourcePath, path.join(DEST_ROOT, file));
  }
}

for (const directory of DIRECTORIES) {
  const sourcePath = path.join(SOURCE_ROOT, directory);
  if (fs.existsSync(sourcePath)) {
    copyPath(sourcePath, path.join(DEST_ROOT, directory));
  }
}

console.log(`Copied Focus Forge web assets to ${DEST_ROOT}`);
