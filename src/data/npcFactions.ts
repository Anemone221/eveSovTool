import angelIcon from '@/assets/faction-icons/angel.png?inline';
import bloodIcon from '@/assets/faction-icons/blood.png?inline';
import guristasIcon from '@/assets/faction-icons/guristas.png?inline';
import dronesIcon from '@/assets/faction-icons/drones.png?inline';
import sanshaIcon from '@/assets/faction-icons/sansha.png?inline';
import serpentisIcon from '@/assets/faction-icons/serpentis.png?inline';

export type NpcFactionId =
  | 'angel'
  | 'blood'
  | 'guristas'
  | 'sansha'
  | 'serpentis'
  | 'drones'
  | 'triglavian';

export interface NpcFactionMeta {
  label: string;
  color: string;
  glyph: string;
  iconPath?: string;
}

export const NPC_FACTION_META: Record<NpcFactionId, NpcFactionMeta> = {
  angel: { label: 'Angel Cartel', color: '#b94a3a', glyph: 'A', iconPath: angelIcon },
  blood: { label: 'Blood Raiders', color: '#8a1f2b', glyph: 'BR', iconPath: bloodIcon },
  guristas: { label: 'Guristas Pirates', color: '#3a6fb9', glyph: 'G', iconPath: guristasIcon },
  sansha: { label: "Sansha's Nation", color: '#7a3aa8', glyph: 'S', iconPath: sanshaIcon },
  serpentis: { label: 'Serpentis', color: '#3a8a55', glyph: 'Sp', iconPath: serpentisIcon },
  drones: { label: 'Rogue Drones', color: '#2f8a8a', glyph: 'D', iconPath: dronesIcon },
  triglavian: { label: 'Triglavian Collective', color: '#a8347a', glyph: 'T' },
};

const REGION_TO_NPC_FACTION: Record<string, NpcFactionId> = {
  // Angel
  'curse': 'angel',
  'great wildlands': 'angel',
  'scalding pass': 'angel',
  'wicked creek': 'angel',
  'insmother': 'angel',
  'cache': 'angel',
  'detorid': 'angel',
  'immensea': 'angel',
  'tenerifis': 'angel',
  'omist': 'angel',
  'feythabolis': 'angel',
  'impass': 'angel',
  'heimatar': 'angel',
  'metropolis': 'angel',
  'molden heath': 'angel',
  // Blood Raider
  'delve': 'blood',
  'querious': 'blood',
  'period basis': 'blood',
  'aridia': 'blood',
  'the bleak lands': 'blood',
  'genesis': 'blood',
  'kador': 'blood',
  'khanid': 'blood',
  'kor-azor': 'blood',
  // Guristas
  'venal': 'guristas',
  'tenal': 'guristas',
  'branch': 'guristas',
  'deklein': 'guristas',
  'pure blind': 'guristas',
  'tribute': 'guristas',
  'vale of the silent': 'guristas',
  'geminate': 'guristas',
  'black rise': 'guristas',
  'the citadel': 'guristas',
  'the forge': 'guristas',
  'lonetrek': 'guristas',
  // Sansha
  'stain': 'sansha',
  'catch': 'sansha',
  'providence': 'sansha',
  'esoteria': 'sansha',
  'paragon soul': 'sansha',
  'tash-murkon': 'sansha',
  // Serpentis
  'fountain': 'serpentis',
  'outer ring': 'serpentis',
  'syndicate': 'serpentis',
  'cloud ring': 'serpentis',
  'fade': 'serpentis',
  'essence': 'serpentis',
  'everyshore': 'serpentis',
  'placid': 'serpentis',
  'sinq laison': 'serpentis',
  'solitude': 'serpentis',
  'verge vendor': 'serpentis',
  // Rogue Drones
  'cobalt edge': 'drones',
  'etherium reach': 'drones',
  'the kalevala expanse': 'drones',
  'malpais': 'drones',
  'oasa': 'drones',
  'outer passage': 'drones',
  'perrigen falls': 'drones',
  'the spire': 'drones',
  // Triglavian
  'pochven': 'triglavian',
};

export function npcFactionForRegion(regionName: string | null | undefined): NpcFactionId | null {
  if (!regionName) return null;
  const key = regionName.trim().toLowerCase();
  return REGION_TO_NPC_FACTION[key] ?? null;
}
