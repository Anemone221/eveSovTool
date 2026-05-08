import { NPC_FACTION_META, npcFactionForRegion } from '@/data/npcFactions';

interface Props {
  regionName: string | null | undefined;
  size?: number;
  title?: string;
}

export function NpcFactionIcon({ regionName, size = 14, title }: Props): JSX.Element | null {
  const id = npcFactionForRegion(regionName);
  if (!id) return null;
  const meta = NPC_FACTION_META[id];
  const fontSize = Math.max(8, Math.round(size * 0.6));
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize,
    backgroundColor: meta.iconPath ? undefined : meta.color,
  };
  return (
    <span
      className={`npc-faction-icon npc-faction-icon--${id}`}
      style={style}
      title={title ?? `${meta.label} (${regionName})`}
    >
      {meta.iconPath ? (
        <img src={meta.iconPath} alt={meta.label} width={size} height={size} />
      ) : (
        meta.glyph
      )}
    </span>
  );
}
