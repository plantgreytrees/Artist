export default function Layout({ children }: { children: unknown }) {
  return <section>{children as never}</section>;
}
