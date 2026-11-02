import { randomUUID } from 'node:crypto';
import type { IdGenerator } from '../ports/id-generator.ts';

export const uuidIds: IdGenerator = { next: () => randomUUID() };
