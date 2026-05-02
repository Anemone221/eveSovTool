export function regionNameToUrl(name: string): string {
  return `https://evemaps.dotlan.net/svg/${name.replace(/ /g, '_')}.dark.svg`;
}
