type HeroProps = { title: string; image: string };

export function Hero({ title, image }: HeroProps) {
  return <section className="hero hero-ui" data-image={image}>{title}</section>;
}
