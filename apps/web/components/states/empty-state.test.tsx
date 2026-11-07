import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('names the empty section and offers its action', () => {
    render(
      <EmptyState
        icon={<svg aria-hidden="true" />}
        title="لم تربط أي حساب بعد"
        body="سيظهر حسابك هنا"
        action={<button type="button">ربط حساب</button>}
      />,
    );

    expect(screen.getByRole('heading', { name: 'لم تربط أي حساب بعد' })).toBeInTheDocument();
    expect(screen.getByText('سيظهر حسابك هنا')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ربط حساب' })).toBeInTheDocument();
  });
});
