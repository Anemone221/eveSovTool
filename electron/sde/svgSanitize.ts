/**
 * Strip dotlan map chrome we don't need while retaining system names and copyright.
 * Uses regex surgery — safe because the SVG structure comes from a single known source (Wollari).
 */
export function sanitizeDotlanSvg(raw: string): string {
  let svg = raw;

  // Strip the legend/key group entirely (the <g id="legend">…</g> block).
  svg = svg.replace(/<g\s+id="legend"[\s\S]*?<\/g>\s*/i, '');

  // Strip alliance/NPC affiliation text labels (<text class="st">).
  svg = svg.replace(/<text[^>]*class="st"[^>]*>[\s\S]*?<\/text>/g, '');

  // Strip dotlan hyperlink anchors — not useful in the app context.
  svg = svg.replace(/<a\s[^>]*xlink:href[^>]*>/g, '');
  svg = svg.replace(/<\/a>/g, '');

  // Strip incursion / reinforced-sov / campaign indicators.
  // Gradient defs used by these states.
  svg = svg.replace(/<radialGradient\s+id="(?:incBg|incStBg|conBg|camBg|camActiveBg)"[\s\S]*?<\/radialGradient>/g, '');
  // Campaign symbol defs.
  svg = svg.replace(/<symbol\s+id="(?:defCampaign|defCampaignActive)"[\s\S]*?<\/symbol>/g, '');
  // Any <use> elements referencing campaign symbols (injected by dotlan's init script).
  svg = svg.replace(/<use[^>]*xlink:href="#def(?:Campaign|CampaignActive)"[^>]*\/?\s*>/g, '');
  // Remove incursion/contest/campaign fill classes from system rect elements so the
  // coloured halos don't appear on system nodes.
  svg = svg.replace(/\bclass="(?:inc|incs|con|cam|cam-active)"/g, 'class="s"');

  return svg;
}
