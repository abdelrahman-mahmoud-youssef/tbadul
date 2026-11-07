const locale = 'ar-u-nu-latn';

const numbers = new Intl.NumberFormat(locale);

const dateTimes = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

export const formatNumber = (value: number): string => numbers.format(value);

export const formatDateTime = (value: Date | string): string => dateTimes.format(new Date(value));
