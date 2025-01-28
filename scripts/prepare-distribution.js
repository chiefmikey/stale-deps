import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

async function main() {
  // Read the original package.json
  const package_ = JSON.parse(
    await fs.readFile(path.join(rootDir, 'package.json')),
  );

  // Create a simplified version for distribution
  const distributionPackage = {
    name: package_.name,
    version: package_.version,
    description: package_.description,
    main: 'index.js', // Simplified path since we're in dist
    type: package_.type,
    bin: {
      depsweep: 'index.js', // Simplified path
    },
    engines: package_.engines,
    dependencies: package_.dependencies,
    homepage: package_.homepage,
    repository: package_.repository,
    bugs: package_.bugs,
    license: package_.license,
    keywords: package_.keywords,
    author: package_.author,
  };

  // Write the modified package.json to dist
  await fs.writeFile(
    path.join(distDir, 'package.json'),
    JSON.stringify(distributionPackage, null, 2),
  );

  // Copy other necessary files
  await fs.copyFile(
    path.join(rootDir, 'README.md'),
    path.join(distDir, 'README.md'),
  );
  await fs.copyFile(
    path.join(rootDir, 'LICENSE'),
    path.join(distDir, 'LICENSE'),
  );
}

main().catch(console.error);
