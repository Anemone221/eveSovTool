import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface LegendIcons {
  // Structures (above node)
  Keepstar: string;
  Fortizar: string;
  Astrahus: string;
  Sotiyo: string;
  Azbel: string;
  Raitaru: string;
  Tatara: string;
  Athanor: string;
  // Upgrades / features (below node)
  miningFrigate: string;
  miningBarge: string;
  industrialCommand: string;
  combatSite: string;
  jumpPortal: string;
  cynoBeacon: string;
  cynoJammer: string;
  relicSite: string;
  effectElectric: string;
  effectExotic: string;
  effectGamma: string;
  effectPlasma: string;
}

export function loadLegendIcons(srcRoot: string): LegendIcons {
  const i = (rel: string) =>
    'data:image/png;base64,' +
    readFileSync(join(srcRoot, rel)).toString('base64');
  return {
    Keepstar:         i('src/assets/map-icons/citadelExtraLarge.png'),
    Fortizar:         i('src/assets/map-icons/citadelLarge.png'),
    Astrahus:         i('src/assets/map-icons/citadelMedium.png'),
    Sotiyo:           i('src/assets/map-icons/engineeringComplexExtraLarge.png'),
    Azbel:            i('src/assets/map-icons/engineeringComplexLarge.png'),
    Raitaru:          i('src/assets/map-icons/engineeringComplexMedium.png'),
    Tatara:           i('src/assets/map-icons/refineryLarge.png'),
    Athanor:          i('src/assets/map-icons/refineryMedium.png'),
    miningFrigate:    i('src/assets/map-icons/miningFrigate_16.png'),
    miningBarge:      i('src/assets/map-icons/miningBarge_16.png'),
    industrialCommand:i('src/assets/map-icons/industrialCommand_16.png'),
    combatSite:       i('src/assets/map-icons/combatSite_16.png'),
    jumpPortal:       i('src/assets/map-icons/jumpPortalArray.png'),
    cynoBeacon:       i('src/assets/map-icons/cynosuralBeacon.png'),
    cynoJammer:       i('src/assets/map-icons/cynosuralSystemJammer.png'),
    relicSite:        i('src/assets/map-icons/relic_Site_16.png'),
    effectElectric:   i('src/assets/map-icons/systemEffects/Electric.png'),
    effectExotic:     i('src/assets/map-icons/systemEffects/Exotic.png'),
    effectGamma:      i('src/assets/map-icons/systemEffects/Gamma.png'),
    effectPlasma:     i('src/assets/map-icons/systemEffects/Plasma.png'),
  };
}

/**
 * Strip dotlan map chrome we don't need while retaining system names, legend, and copyright.
 * Uses regex surgery — safe because the SVG structure comes from a single known source (Wollari).
 *
 * When icons are provided the dotlan legend contents are replaced with our app icon key.
 */
export function sanitizeDotlanSvg(raw: string, icons?: LegendIcons): string {
  let svg = raw;

  // Strip glow group and all its contents — volatile live data (campaigns, incursions).
  svg = svg.replace(/<g\s[^>]*id="glow"[^>]*>[\s\S]*?<\/g>/g, '');

  // Strip alliance/NPC affiliation text labels (<text class="st">).
  svg = svg.replace(/<text[^>]*class="st"[^>]*>[\s\S]*?<\/text>/g, '');

  // Strip ongoing sov campaign markers (class="sc") — volatile live data.
  svg = svg.replace(/<text[^>]*class="sc"[^>]*>[\s\S]*?<\/text>/g, '');
  svg = svg.replace(new RegExp('<circle[^>]*class="sc"[^>]*/>', 'g'), '');

  // Strip incursion overlays (class="ic") — volatile live data.
  svg = svg.replace(/<text[^>]*class="ic"[^>]*>[\s\S]*?<\/text>/g, '');
  svg = svg.replace(new RegExp('<circle[^>]*class="ic"[^>]*/>', 'g'), '');
  svg = svg.replace(new RegExp('<rect[^>]*class="ic"[^>]*/>', 'g'), '');

  // Strip dotlan hyperlink anchors — not useful in the app context.
  svg = svg.replace(/<a\s[^>]*xlink:href[^>]*>/g, '');
  svg = svg.replace(/<\/a>/g, '');

  if (icons) {
    svg = replaceLegend(svg, icons);
  }

  return svg;
}

// ---------------------------------------------------------------------------
// Legend replacement
// ---------------------------------------------------------------------------

const ICON_SIZE = 16;
const ENTRY_ROW_H = 20;  // vertical pitch per icon+label row
const TEXT_X_OFF = 20;   // label x offset from column left edge
const COL_W = 110;       // width of one column (icon + label text)
const COL_GAP = 8;       // horizontal gap between the two columns
const HEADING_H = 14;    // section heading row height
const DIVIDER_H = 6;     // gap occupied by the divider line between sections
const FOOTER_H = 14;     // copyright footer height
const PAD = 8;           // inner padding from legend box edges

type IconEntry = { src: string; caption: string };

interface LegendSection {
  leftHeading: string;
  rightHeading: string;
  left: IconEntry[];
  right: IconEntry[];
}

function buildSections(icons: LegendIcons): LegendSection[] {
  return [
    {
      leftHeading: 'Structures',
      rightHeading: 'Upgrades',
      left: [
        { src: icons.Keepstar,          caption: 'Keepstar' },
        { src: icons.Fortizar,          caption: 'Fortizar' },
        { src: icons.Astrahus,          caption: 'Astrahus' },
        { src: icons.Sotiyo,            caption: 'Sotiyo' },
        { src: icons.Azbel,             caption: 'Azbel' },
        { src: icons.Raitaru,           caption: 'Raitaru' },
        { src: icons.Tatara,            caption: 'Tatara' },
        { src: icons.Athanor,           caption: 'Athanor' },
      ],
      right: [
        { src: icons.miningFrigate,     caption: 'Mining T1' },
        { src: icons.miningBarge,       caption: 'Mining T2' },
        { src: icons.industrialCommand, caption: 'Mining T3' },
        { src: icons.combatSite,        caption: 'Combat' },
        { src: icons.jumpPortal,        caption: 'Ansiblex' },
        { src: icons.cynoBeacon,        caption: 'Cyno Beacon' },
        { src: icons.cynoJammer,        caption: 'Cyno Jammer' },
        { src: icons.relicSite,         caption: 'Relic Sites' },
      ],
    },
    {
      leftHeading: 'Stability',
      rightHeading: '',
      left: [
        { src: icons.effectElectric,    caption: 'Electric' },
        { src: icons.effectExotic,      caption: 'Exotic' },
      ],
      right: [
        { src: icons.effectGamma,       caption: 'Gamma' },
        { src: icons.effectPlasma,      caption: 'Plasma' },
      ],
    },
  ];
}

function sectionHeight(sec: LegendSection): number {
  return HEADING_H + Math.max(sec.left.length, sec.right.length) * ENTRY_ROW_H;
}

function renderEntries(
  entries: IconEntry[],
  colX: number,
  startY: number,
  lines: string[],
): void {
  let curY = startY;
  for (const { src, caption } of entries) {
    const midY = curY + ICON_SIZE / 2;
    lines.push(
      `<image x="${colX}" y="${curY}" width="${ICON_SIZE}" height="${ICON_SIZE}" href="${src}">` +
      `<title>${caption}</title></image>`,
    );
    lines.push(
      `<text x="${colX + TEXT_X_OFF}" y="${midY + 4}" class="l" text-anchor="start">${caption}</text>`,
    );
    curY += ENTRY_ROW_H;
  }
}

// Gap between the original map content and the legend column, and between the
// legend box and the outer edge of the expanded viewport.
const LEGEND_MARGIN = 10;

function replaceLegend(svg: string, icons: LegendIcons): string {
  const legendMatch = svg.match(/<g\s+id="legend">([\s\S]*?)<\/g>/i);
  if (!legendMatch) return svg;

  const innerHtml = legendMatch[1];

  const copyrightMatch = innerHtml.match(/<text[^>]*class="lc"[^>]*>([\s\S]*?)<\/text>/i);
  const copyrightText = copyrightMatch
    ? copyrightMatch[1].trim()
    : '&#169; by Wollari &amp; CCP';

  const sections = buildSections(icons);
  const w = PAD + COL_W + COL_GAP + COL_W + PAD;

  // Compute legend height up front so it can inform the viewBox crop.
  const contentH = sections.reduce((acc, s, i) =>
    acc + sectionHeight(s) + (i < sections.length - 1 ? DIVIDER_H : 0), 0);
  const h = PAD + contentH + FOOTER_H + PAD;

  // Widen the viewBox to the right to create a dedicated legend strip, then
  // place the legend inside that strip so it never overlaps map content.
  const vbMatch = svg.match(/\bviewBox="([^"]+)"/i);
  let lx: number;
  let ly: number;
  if (vbMatch) {
    const [vbX, vbY, vbW, vbH] = vbMatch[1].split(/\s+/).map(Number);
    // Extra width = legend box + margin on both sides of it.
    const extraW = w + LEGEND_MARGIN * 2;
    // Trim the top/bottom margin baked into the dotlan viewBox, keeping at
    // least enough height for the legend box itself.
    const newY = vbY + LEGEND_MARGIN;
    const newH = Math.max(vbH - LEGEND_MARGIN * 2, h);
    const newViewBox = `${vbX} ${newY} ${vbW + extraW} ${newH}`;
    svg = svg.replace(/\bviewBox="[^"]+"/i, `viewBox="${newViewBox}"`);
    // Legend sits in the new strip, flush to the original right edge + margin.
    lx = vbX + vbW + LEGEND_MARGIN;
    ly = newY;
  } else {
    // No viewBox — fall back to the original legend position.
    const rectMatch = innerHtml.match(/<rect[^>]+x="([^"]+)"[^>]+y="([^"]+)"/i);
    if (!rectMatch) return svg;
    lx = parseFloat(rectMatch[1]);
    ly = parseFloat(rectMatch[2]);
  }

  const leftX  = lx + PAD;
  const rightX = lx + PAD + COL_W + COL_GAP;

  const lines: string[] = [];
  lines.push(`<rect x="${lx}" y="${ly}" width="${w}" height="${h}" class="lb"/>`);

  let curY = ly + PAD;

  sections.forEach((sec, i) => {
    // Per-column headings
    lines.push(
      `<text x="${leftX}" y="${curY + HEADING_H - 3}" class="l" font-style="italic" text-anchor="start">${sec.leftHeading}</text>`,
    );
    if (sec.rightHeading) {
      lines.push(
        `<text x="${rightX}" y="${curY + HEADING_H - 3}" class="l" font-style="italic" text-anchor="start">${sec.rightHeading}</text>`,
      );
    }
    curY += HEADING_H;

    renderEntries(sec.left,  leftX,  curY, lines);
    renderEntries(sec.right, rightX, curY, lines);
    curY += Math.max(sec.left.length, sec.right.length) * ENTRY_ROW_H;

    // Divider line between sections
    if (i < sections.length - 1) {
      const divY = curY + DIVIDER_H / 2;
      lines.push(
        `<line x1="${lx + PAD}" y1="${divY}" x2="${lx + w - PAD}" y2="${divY}" class="l" opacity="0.4"/>`,
      );
      curY += DIVIDER_H;
    }
  });

  // Copyright footer
  const footerY = ly + PAD + contentH;
  lines.push(`<rect x="${lx}" y="${footerY}" width="${w}" height="${FOOTER_H}" class="lb"/>`);
  lines.push(
    `<text x="${lx + w / 2}" y="${footerY + FOOTER_H - 3}" class="lc" text-anchor="middle">${copyrightText}</text>`,
  );

  const replacement = `<g id="legend">\n${lines.join('\n')}\n</g>`;
  return svg.replace(/<g\s+id="legend">[\s\S]*?<\/g>/i, replacement);
}
