import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

describe('Project Structure Validation', () => {
  const rootDir = path.resolve(__dirname, '..');

  it('should contain src/index.ts and src/plugin.ts', () => {
    expect(fs.existsSync(path.join(rootDir, 'src', 'index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, 'src', 'plugin.ts'))).toBe(true);
  });

  it('should not track build artifacts in git', () => {
    const output = execSync('git ls-files dist', { encoding: 'utf8' });
    expect(output.trim()).toBe('');
  });
});
