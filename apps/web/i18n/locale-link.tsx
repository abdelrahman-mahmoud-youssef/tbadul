import { getLocale } from 'next-intl/server';
import NextLink from 'next/link';
import type { ComponentProps } from 'react';
import { localizedPath, type AppPath } from './paths';

type LocaleLinkProps = Omit<ComponentProps<typeof NextLink>, 'href'> & {
  readonly href: AppPath;
};

export async function LocaleLink({ href, ...props }: LocaleLinkProps) {
  return <NextLink href={localizedPath(href, await getLocale())} {...props} />;
}
