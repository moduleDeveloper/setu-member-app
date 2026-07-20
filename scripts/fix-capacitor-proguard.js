import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const targets = [
  'node_modules/@capacitor-community/facebook-login/android/build.gradle',
  'node_modules/@capawesome/capacitor-app-update/android/build.gradle'
];

const rootDir = process.cwd();
let patchedCount = 0;

for (const relativePath of targets) {
  const filePath = path.join(rootDir, relativePath);
  if (!existsSync(filePath)) {
    continue;
  }

  const original = readFileSync(filePath, 'utf8');
  const updated = original.replace(/proguard-android\.txt/g, 'proguard-android-optimize.txt');

  if (updated !== original) {
    writeFileSync(filePath, updated, 'utf8');
    patchedCount += 1;
    console.log(`[fix-capacitor-proguard] patched ${relativePath}`);
  }
}

if (patchedCount === 0) {
  console.log('[fix-capacitor-proguard] no changes needed');
}
