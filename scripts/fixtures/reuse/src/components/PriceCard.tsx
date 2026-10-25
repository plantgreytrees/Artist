type PriceCardProps = { price: string };

export function PriceCard({ price }: PriceCardProps) {
  return <div className="card">{price}</div>;
}
