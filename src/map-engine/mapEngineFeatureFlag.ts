export function shouldUseSelectiveMapEngine(
  mapId: string,
  enabledMapIds: readonly string[],
): boolean {
  return enabledMapIds.includes(mapId);
}
