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
  return {
    ...memory,
    save: async (claim) => {
      await memory.save(claim);
      writeFileSync(path, JSON.stringify([...claims.values()], null, 2));
    },
  };
};
