import fs from 'fs';

const pkgPath = './package.json';
const manifestPath = './manifest.json';

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const versionParts = pkg.version.split('.').map(Number);
versionParts[2] += 1;
const newVersion = versionParts.join('.');

pkg.version = newVersion;
manifest.version = newVersion;

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Bumped version to ${newVersion}`);
