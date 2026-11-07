import { useQueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryProvider } from './query-provider';

function StaleTime() {
  return <output>{String(useQueryClient().getDefaultOptions().queries?.staleTime)}</output>;
}

describe('QueryProvider', () => {
  it('gives its subtree one query client', () => {
    render(
      <QueryProvider>
        <StaleTime />
      </QueryProvider>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('30000');
  });
});
