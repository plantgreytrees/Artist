type PromoProps = { heading: string; body: string; cta: string };

export function Promo({ heading, body, cta }: PromoProps) {
  return <div className="promo"><h3>{heading}</h3><p>{body}</p><a>{cta}</a></div>;
}
