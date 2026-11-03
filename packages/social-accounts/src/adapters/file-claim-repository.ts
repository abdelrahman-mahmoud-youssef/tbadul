import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { AccountClaim } from '../domain/claim.ts';
import type { AccountClaimRepository } from '../ports/account-claim-repository.ts';
import { claimStore } from './in-memory-claim-repository.ts';

export const fileClaimRepository = (path: string): AccountClaimRepository => {
  const claims = new Map<string, AccountClaim>(
    existsSync(path)
      ? (JSON.parse(readFileSync(path, 'utf8')) as AccountClaim[]).map((claim) => [claim.id, claim])
      : [],
  );
  const memory = claimStore(claims);
  const persisted = async <T>(change: Promise<T>): Promise<T> => {
    const result = await change;
    writeFileSync(path, JSON.stringify([...claims.values()], null, 2));
    return result;
  };
  return {
    ...memory,
    create: (claim, limit) => persisted(memory.create(claim, limit)),
    save: (claim) => persisted(memory.save(claim)),
    verify: (claim) => persisted(memory.verify(claim)),
  };
};
