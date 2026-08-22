import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { OutcomeRecord } from '../src/intelligence-types';

function locations(): { dataDirectory: string; outcomeFile: string } {
  const dataDirectory = process.env.HAPPY_SOILS_DATA_DIR
    ? path.resolve(process.env.HAPPY_SOILS_DATA_DIR)
    : path.resolve('.local-data');
  return { dataDirectory, outcomeFile: path.join(dataDirectory, 'outcomes.jsonl') };
}

export async function appendOutcome(outcome: OutcomeRecord): Promise<void> {
  const { dataDirectory, outcomeFile } = locations();
  await mkdir(dataDirectory, { recursive: true });
  await appendFile(outcomeFile, `${JSON.stringify(outcome)}\n`, { encoding: 'utf8', mode: 0o600 });
}

export async function readOutcomes(): Promise<OutcomeRecord[]> {
  const { outcomeFile } = locations();
  try {
    const content = await readFile(outcomeFile, 'utf8');
    return content.split('\n').filter(Boolean).map((line) => JSON.parse(line) as OutcomeRecord);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
