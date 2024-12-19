import fs from 'node:fs/promises';
import path from 'node:path';

import { mockProjectRoot } from './setup';

export default async function teardown(): Promise<void> {
  try {
    // Clean up any temporary test files
    await fs.rm(mockProjectRoot, { recursive: true, force: true });

    // Clean up any CLI-related files
    const cliDir = path.join(__dirname, '..', 'src');
    await fs.rm(path.join(cliDir, 'cli.js'), { force: true });
  } catch (error) {
    // Log cleanup errors but don't fail the test suite
    console.warn('Warning: Error during test teardown:', error);
  }
}

// Handle cleanup if running directly
if (require.main === module) {
  teardown().catch(console.error);
}
