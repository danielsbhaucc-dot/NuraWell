import type { RegistryModule } from './types';
import { CAT_TINT } from './labels';
export function ModuleIcon({ m, on, small, big }: { m: RegistryModule; on: boolean; small?: boolean; big?: boolean }) {
  return (
    <span className={`fd-icon ${small ? 'is-small' : ''} ${big ? 'is-big' : ''} ${on ? '' : 'is-off'}`} style={{ ['--tint' as string]: CAT_TINT[m.category] }} aria-hidden>
      <span className="fd-icon-tab" />
      <span className="fd-icon-body">{m.store.name.slice(0, 1)}</span>
      {on ? <span className="fd-icon-on" /> : null}
    </span>
  );
}
