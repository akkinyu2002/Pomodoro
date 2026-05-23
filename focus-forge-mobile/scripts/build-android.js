const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const androidRoot = path.join(__dirname, '..', 'android');
const gradlewBat = path.join(androidRoot, 'gradlew.bat');
const gradlewSh = path.join(androidRoot, 'gradlew');

if (!fs.existsSync(androidRoot)) {
  console.error('Android platform is missing. Run `npm run android:add` first.');
  process.exit(1);
}

const command = process.platform === 'win32' && fs.existsSync(gradlewBat)
  ? gradlewBat
  : gradlewSh;

if (!fs.existsSync(command)) {
  console.error('Gradle wrapper not found. Generate the Android platform first.');
  process.exit(1);
}

const result = spawnSync(command, ['assembleDebug'], {
  cwd: androidRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

process.exit(result.status === null ? 1 : result.status);
