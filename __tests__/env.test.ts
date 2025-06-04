import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

describe('Environment Setup', () => {
  it('should verify configuration files exist', () => {
    const requiredFiles = ['package.json', 'tsconfig.json', 'tsconfig.build.json', 'tsup.config.ts', 'vitest.config.ts'];
    for (const file of requiredFiles) {
      const filePath = path.join(process.cwd(), file);
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });

  it('should have project package.json with correct name', () => {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    expect(pkg.name).toBe('twitter-rss-agent');
    expect(pkg.license).toBe('MIT');
  });
});
