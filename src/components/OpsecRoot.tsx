import { useEffect } from 'react';
import { useEffectiveOpsec } from '@/state/opsecStore';

const FLAG_TO_ATTR: Record<string, string> = {
  workforceHidePercent: 'data-opsec-wf-percent',
  workforceHideCount: 'data-opsec-wf-count',
  workforceHideVisual: 'data-opsec-wf-visual',
  powerHidePercent: 'data-opsec-pw-percent',
  powerHideCount: 'data-opsec-pw-count',
  powerHideVisual: 'data-opsec-pw-visual',
  hideSupercaps: 'data-opsec-supercaps',
  hideSystemEffects: 'data-opsec-system-effects',
  hideTransferRoute: 'data-opsec-transfer-route',
  hideGasIceBalance: 'data-opsec-gas-ice',
  hideSystemNames: 'data-opsec-system-names'
};

export function OpsecRoot({ children }: { children: React.ReactNode }): JSX.Element {
  const flags = useEffectiveOpsec();
  useEffect(() => {
    const body = document.body;
    for (const [flag, attr] of Object.entries(FLAG_TO_ATTR)) {
      if ((flags as unknown as Record<string, boolean>)[flag]) {
        body.setAttribute(attr, '1');
      } else {
        body.removeAttribute(attr);
      }
    }
  }, [flags]);
  return <>{children}</>;
}
