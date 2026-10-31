/** Flat live-price mark. No glow. */
export default function LiveDot() {
  return (
    <span
      title="Live from Pyth"
      className="inline-block shrink-0 rounded-full"
      style={{ width: 6, height: 6, background: "var(--up)" }}
    />
  );
}
