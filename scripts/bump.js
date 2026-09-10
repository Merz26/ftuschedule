import fs from 'fs';

const pkgPath = './package.json';
const manifestPath = './manifest.json';

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const mode = process.argv[2] || 'patch'; // 'patch', 'minor', 'major'
const versionParts = (pkg.version || '1.1.0').split('.').map(Number);

if (mode === 'major') {
  versionParts[0] += 1;
  versionParts[1] = 0;
  versionParts[2] = 0;
} else if (mode === 'minor') {
  versionParts[1] += 1;
  versionParts[2] = 0;
} else {
  versionParts[2] += 1;
}

const newVersion = versionParts.join('.');
pkg.version = newVersion;
manifest.version = newVersion;

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Bumped version (${mode}) to ${newVersion}`);
