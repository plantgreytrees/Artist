type ButtonProps = {
  variant: "primary" | "secondary";
};

export function Button({ variant }: ButtonProps) {
  return (
    <button data-variant={variant} className="bg-brand px-4 hover:bg-surface/80 md:p-4">
      go
    </button>
  );
}
