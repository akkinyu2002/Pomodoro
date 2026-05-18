const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const files = ['app.min.js', 'styles.css'];
files.forEach(file => {
  const src = path.join(__dirname, '..', file);
  if (!fs.existsSync(src)) {
    console.error('Missing', src);
    return;
  }
  const data = fs.readFileSync(src);
  const gz = zlib.gzipSync(data, { level: zlib.constants.Z_BEST_COMPRESSION });
  fs.writeFileSync(src + '.gz', gz);
  try {
    const br = zlib.brotliCompressSync(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
    fs.writeFileSync(src + '.br', br);
  } catch (err) {
    console.error('brotli failed for', file, err.message);
  }
  const orig = data.length;
  const gzSize = gz.length;
  const brSize = fs.existsSync(src + '.br') ? fs.readFileSync(src + '.br').length : null;
  console.log(file, 'orig=', orig, 'gz=', gzSize, 'br=', brSize);
});