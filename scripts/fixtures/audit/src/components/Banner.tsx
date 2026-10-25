type BannerProps = { heading: string; body: string; cta: string };

export function Banner({ heading, body, cta }: BannerProps) {
  return <aside className="banner"><h2>{heading}</h2><p>{body}</p><a>{cta}</a></aside>;
}
