import type { RunResult } from '../types';
import { writeCsv } from './csv';
import { writeHtml } from './html';
import { writeJson } from './json';
import { writeMarkdown } from './markdown';

/** Writes every report file and returns the path of the dashboard (index.html). */
export function writeReports(run: RunResult, outDir: string): string {
  writeJson(run, outDir);
  writeCsv(run, outDir);
  writeMarkdown(run, outDir);
  return writeHtml(run, outDir);
}
