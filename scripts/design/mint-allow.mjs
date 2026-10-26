/** Files where tinted light literals are intentional (frozen / dark canonical screens, emails, rendered evidence). */
export const MINT_ALLOW = [
  /^app\/landing-v2\//, // frozen canonical dark landing
  /coming-?soon/i, // frozen coming-soon screen (coming-soon-legacy.css, components/coming-soon/*)
  /^lib\/email\//, /email-templates?/i, // email HTML
  /^lib\/legal\/media\//, /^lib\/legal\/evidence-viewer\.ts$/, // rendered legal evidence (print)
  /\.generated\.ts$/, // generated docs
];
