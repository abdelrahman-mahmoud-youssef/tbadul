import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/lib/api-error';
import messages from '@/messages/ar.json';
import type { ErrorCopy } from './error-copy';
import { ErrorState } from './error-state';

const copy: ErrorCopy = {
  title: messages.states.errorTitle,
  body: messages.states.errorBody,
  retry: messages.states.retry,
  codes: messages.errors,
};

describe('ErrorState', () => {
  it('words an API error by its contract code', () => {
    render(
      <ErrorState
        error={new ApiRequestError({ code: 'source_unavailable' }, 503)}
        retry={vi.fn()}
        copy={copy}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(messages.errors.source_unavailable);
  });

  it('falls back to the general message for any other failure', () => {
    render(<ErrorState error={new TypeError('fetch failed')} retry={vi.fn()} copy={copy} />);

    expect(screen.getByRole('alert')).toHaveTextContent(messages.states.errorBody);
  });

  it('retries on request', async () => {
    const retry = vi.fn();
    render(<ErrorState error={new Error('boom')} retry={retry} copy={copy} />);

    await userEvent.click(screen.getByRole('button', { name: messages.states.retry }));

    expect(retry).toHaveBeenCalledOnce();
  });
});
