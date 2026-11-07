import { errorCode, type ErrorCode } from '@engagement-exchange/contracts';
import { getTranslations } from 'next-intl/server';
import type { ErrorCopy } from './error-copy';

export const errorCopy = async (): Promise<ErrorCopy> => {
  const t = await getTranslations();
  return {
    title: t('states.errorTitle'),
    body: t('states.errorBody'),
    retry: t('states.retry'),
    codes: Object.fromEntries(
      errorCode.options.map((code) => [code, t(`errors.${code}`)]),
    ) as Record<ErrorCode, string>,
  };
};
