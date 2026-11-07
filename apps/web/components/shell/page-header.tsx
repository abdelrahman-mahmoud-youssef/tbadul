export function PageHeader({ title }: { readonly title: string }) {
  return <h1 className="text-2xl leading-snug font-bold md:text-3xl">{title}</h1>;
}
