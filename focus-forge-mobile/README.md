# Focus Forge Mobile

This is a separate mobile wrapper project for Focus Forge. It does not modify the existing web app files.

## What it does

- Copies the current web app into `www/`
- Uses Capacitor to prepare an Android app shell
- Keeps the main project source untouched

## Setup

From this folder:

```bash
npm install
npm run sync:web
```

## Android build

You need Android Studio, JDK, Gradle, and the Android SDK installed on this machine.

Then run:

```bash
npx cap add android
npx cap open android
```

Build a signed APK inside Android Studio or with Gradle once the Android SDK is available.

## Cloud APK build

The main repository also includes a GitHub Actions workflow that can build a debug APK and upload it as an artifact.

Look for the workflow named `Build Focus Forge Android APK` in GitHub Actions and download the `focus-forge-android-apk` artifact.

## Notes

This workspace cannot produce the APK by itself because the Android toolchain is not installed here.
