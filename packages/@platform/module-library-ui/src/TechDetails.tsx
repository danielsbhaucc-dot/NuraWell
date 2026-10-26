/** Technical facts stay collapsed so the main view is plain Hebrew only. */
export function TechDetails({ children, title = 'פרטים טכניים' }: { children: React.ReactNode; title?: string }) {
  return <details className="fd-tech"><summary>{title}</summary><div className="fd-tech-body">{children}</div></details>;
}
