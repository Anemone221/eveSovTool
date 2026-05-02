import { useMemo } from 'react';
import { useOpsec, activeFlagLabels } from '@/state/opsecStore';
import { useUi } from '@/state/uiStore';

export function OpsecPill(): JSX.Element {
  const flags = useOpsec((s) => s.flags);
  const focusPanel = useUi((s) => s.focusPanel);
  const active = useMemo(() => activeFlagLabels(flags), [flags]);
  const enabled = active.length > 0;
  const tooltip = enabled
    ? `Op-sec active:\n${active.map((l) => `• ${l}`).join('\n')}\n(click to edit)`
    : 'No op-sec redaction. Click to configure.';
  return (
    <button
      type="button"
      className={`opsec-pill opsec-pill--${enabled ? 'on' : 'off'}`}
      title={tooltip}
      onClick={() => focusPanel('exports')}
    >
      <span className="opsec-pill__dot" />
      {enabled ? 'Op-sec Enabled' : 'Op-sec Disabled'}
    </button>
  );
}
