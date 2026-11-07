const physical = String.raw`(^|\s)(\S*:)?!?-?(m[lr]|p[lr]|left|right|inset-[lr]|border-[lr]|rounded-[lr]|rounded-[tb][lr]|scroll-[mp][lr]|(text|float|clear)-(left|right))(-|\s|$)`;

const message =
  'Use logical classes (ms-, me-, ps-, pe-, start-, end-, text-start, text-end) so the layout follows the text direction.';

export const logicalPropertiesRule = [
  'error',
  { selector: `Literal[value=/${physical}/]`, message },
  { selector: `TemplateElement[value.raw=/${physical}/]`, message },
];
