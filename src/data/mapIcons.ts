import citadelXL from '@/assets/map-icons/citadelExtraLarge.png?inline';
import citadelL from '@/assets/map-icons/citadelLarge.png?inline';
import citadelM from '@/assets/map-icons/citadelMedium.png?inline';
import combatSite from '@/assets/map-icons/combatSite_16.png?inline';
import cynoBeacon from '@/assets/map-icons/cynosuralBeacon.png?inline';
import cynoJammer from '@/assets/map-icons/cynosuralSystemJammer.png?inline';
import engXL from '@/assets/map-icons/engineeringComplexExtraLarge.png?inline';
import engL from '@/assets/map-icons/engineeringComplexLarge.png?inline';
import engM from '@/assets/map-icons/engineeringComplexMedium.png?inline';
import industrialCommand from '@/assets/map-icons/industrialCommand_16.png?inline';
import jumpPortal from '@/assets/map-icons/jumpPortalArray.png?inline';
import miningBarge from '@/assets/map-icons/miningBarge_16.png?inline';
import miningFrigate from '@/assets/map-icons/miningFrigate_16.png?inline';
import refineryL from '@/assets/map-icons/refineryLarge.png?inline';
import refineryM from '@/assets/map-icons/refineryMedium.png?inline';
import relicSite from '@/assets/map-icons/relic_Site_16.png?inline';
import effectElectric from '@/assets/map-icons/systemEffects/Electric.png?inline';
import effectExotic from '@/assets/map-icons/systemEffects/Exotic.png?inline';
import effectGamma from '@/assets/map-icons/systemEffects/Gamma.png?inline';
import effectPlasma from '@/assets/map-icons/systemEffects/Plasma.png?inline';

export const STRUCTURE_ICONS: Record<string, string> = {
  Keepstar: citadelXL,
  Fortizar: citadelL,
  Astrahus: citadelM,
  Sotiyo: engXL,
  Azbel: engL,
  Raitaru: engM,
  Tatara: refineryL,
  Athanor: refineryM,
};

export const STABILITY_ICONS: Record<string, string> = {
  'Electric Stability Generator': effectElectric,
  'Exotic Stability Generator': effectExotic,
  'Gamma Stability Generator': effectGamma,
  'Plasma Stability Geneartor': effectPlasma, // sic — matches DB value
};

export const MINING_ICONS: Record<1 | 2 | 3, string> = {
  1: miningFrigate,
  2: miningBarge,
  3: industrialCommand,
};

export {
  combatSite,
  cynoBeacon,
  cynoJammer,
  jumpPortal,
  relicSite,
};
