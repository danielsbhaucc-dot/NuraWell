import { Accordion } from './Accordion';
/** Technical facts stay collapsed so the main view is plain Hebrew only. */
export function TechDetails({ children, title = 'פרטים טכניים' }: { children: React.ReactNode; title?: string }) {
  return <Accordion title={title} className="fd-tech">{children}</Accordion>;
}
