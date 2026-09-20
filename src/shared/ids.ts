export const compositionIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const controlIdPattern = /^[a-z][a-z0-9-]*$/;
export const hexColorPattern = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function isCompositionId(value: string): boolean {
  return compositionIdPattern.test(value);
}
