import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { RunResult } from '../types';

/** reports/accessibility-report.json: the complete result, for other tools and for the dashboard. */
export function writeJson(run: RunResult, outDir: string): string {
  const file = path.join(outDir, 'accessibility-report.json');
  writeFileSync(file, JSON.stringify(run, null, 2));
  return file;
}
