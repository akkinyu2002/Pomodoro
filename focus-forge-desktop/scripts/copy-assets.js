const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DEST = path.join(__dirname, '..', 'build', 'web');
const FILES = [
  'index.html',
  'app.js',
  'app.min.js',
  'app.min.js.br',
  'styles.css',
  'styles.css.br',
  'sw.js',
  'manifest.webmanifest',
  'offline.html'
];
const DIRECTORIES = ['icons', 'scripts'];

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyItem(sourcePath, targetPath) {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    ensureDirectory(targetPath);
    for (const entry of fs.readdirSync(sourcePath)) {
      copyItem(path.join(sourcePath, entry), path.join(targetPath, entry));
    }
    return;
  }

  ensureDirectory(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

ensureDirectory(DEST);

for (const file of FILES) {
  const sourcePath = path.join(ROOT, file);
  if (fs.existsSync(sourcePath)) {
    copyItem(sourcePath, path.join(DEST, file));
  }
}

for (const directory of DIRECTORIES) {
  const sourcePath = path.join(ROOT, directory);
  if (fs.existsSync(sourcePath)) {
    copyItem(sourcePath, path.join(DEST, directory));
  }
}

console.log(`Copied Focus Forge web assets to ${DEST}`);
