interface MiniMeterProps {
  label: string;
  consumed: number;
  available: number;
}

export function MiniMeter({ label, consumed, available }: MiniMeterProps) {
  const usage = available > 0 ? Math.min(consumed / available, 1) : consumed > 0 ? 1 : 0;
  const over = consumed > available;
  const hue = over ? 0 : 120 * (1 - usage);
  const color = over ? 'var(--danger)' : `hsl(${hue.toFixed(0)}, 65%, 50%)`;
  return (
    <span className="mini-meter" title={`${consumed.toLocaleString()} / ${available.toLocaleString()}`}>
      <span className="mini-meter__label">{label}</span>
      <span className="mini-meter__track">
        <span className="mini-meter__fill" style={{ width: `${usage * 100}%`, background: color }} />
      </span>
    </span>
  );
}
