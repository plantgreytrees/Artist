type PriceCardProps = { price: string; period: string };

export function PriceCard({ price, period }: PriceCardProps) {
  return <div className="card">{price} / {period}</div>;
}
