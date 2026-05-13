import type { StationCoverCredit } from '@/lib/media/stock-image-attribution';
import { providerLabel } from '@/lib/media/stock-image-attribution';

type StockImageAttributionProps = {
  credit: StationCoverCredit;
  variant?: 'admin' | 'public';
  className?: string;
};

export function StockImageAttribution({ credit, variant = 'public', className }: StockImageAttributionProps) {
  const provider = providerLabel(credit.source);
  const linkClass =
    variant === 'admin'
      ? 'underline decoration-slate-400 underline-offset-2 hover:text-slate-900'
      : 'underline decoration-white/40 underline-offset-2 hover:text-white';

  if (credit.source === 'pixabay') {
    return (
      <p className={className}>
        {credit.photographer_url ? (
          <>
            <a href={credit.photographer_url} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {credit.photographer}
            </a>
            {' · '}
          </>
        ) : (
          <span>{credit.photographer} · </span>
        )}
        <a href={credit.page_url} target="_blank" rel="noopener noreferrer" className={linkClass}>
          תמונה
        </a>
        {' · '}
        <a href={credit.provider_url} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {provider}
        </a>
      </p>
    );
  }

  return (
    <p className={className}>
      <a href={credit.page_url} target="_blank" rel="noopener noreferrer" className={linkClass}>
        תמונה
      </a>
      {' · '}
      {credit.photographer_url ? (
        <a href={credit.photographer_url} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {credit.photographer}
        </a>
      ) : (
        <span>{credit.photographer}</span>
      )}
      {' · '}
      <a href={credit.provider_url} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {provider}
      </a>
    </p>
  );
}

type StockImageSearchAttributionProps = {
  providers: { pixabay: boolean; pexels: boolean };
  className?: string;
};

export function StockImageSearchAttribution({ providers, className }: StockImageSearchAttributionProps) {
  if (!providers.pixabay && !providers.pexels) return null;

  return (
    <p className={className}>
      תוצאות חיפוש מ-
      {providers.pixabay ? (
        <a
          href="https://pixabay.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="mx-1 font-semibold underline decoration-emerald-500/50 underline-offset-2"
        >
          Pixabay
        </a>
      ) : null}
      {providers.pixabay && providers.pexels ? ' ו-' : null}
      {providers.pexels ? (
        <a
          href="https://www.pexels.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="mx-1 font-semibold underline decoration-emerald-500/50 underline-offset-2"
        >
          Pexels
        </a>
      ) : null}
    </p>
  );
}
