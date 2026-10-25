type ButtonProps = {
  variant: "primary" | "secondary";
  disabled?: boolean;
  children: React.ReactNode;
};

export function Button({ variant, disabled, children }: ButtonProps) {
  return (
    <button disabled={disabled} data-variant={variant} style={{ background: "var(--color-action-primary)" }}>
      {children}
    </button>
  );
}
