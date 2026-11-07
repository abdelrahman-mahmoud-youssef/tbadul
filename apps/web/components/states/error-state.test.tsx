import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/lib/api-client';
import messages from '@/messages/ar.json';
import { renderInArabic } from '@/testing/render';
import { ErrorState } from './error-state';

describe('ErrorState', () => {
  it('words an API error by its contract code', () => {
    renderInArabic(
      <ErrorState
        error={new ApiRequestError({ code: 'source_unavailable' }, 503)}
        retry={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(messages.errors.source_unavailable);
  });

  it('falls back to the general message for any other failure', () => {
    renderInArabic(<ErrorState error={new TypeError('fetch failed')} retry={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent(messages.states.errorBody);
  });

  it('retries on request', async () => {
    const retry = vi.fn();
    renderInArabic(<ErrorState error={new Error('boom')} retry={retry} />);

    await userEvent.click(screen.getByRole('button', { name: messages.states.retry }));

    expect(retry).toHaveBeenCalledOnce();
  });
});
