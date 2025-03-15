/**
 * Maps backend sucursal names to their display names
 */
export const branchNameMapping: Record<string, string> = {
  "CENTRO": "SUCURSAL CENTRO",
  "ENEDINA - INDUSTRIAS": "SUCURSAL INDUSTRIAS",
  "ENEDINA - NUEVA ESPAÑA": "SUCURSAL NUEVA ESPAÑA",
  "INDUSTRIAL - MIRADOR": "SUCURSAL MIRADOR",
  "KRAMFORS - SAN PEDRO": "SUCURSAL SAN PEDRO",
  "KRAMFORS - WASHINGTON": "SUCURSAL WASHINTON",
  "TECNOLOGICO": "SUCURSAL TECNOLOGICO"
};

/**
 * Transforms a branch name from backend format to display format
 * @param branchName The original branch name from the backend
 * @returns The display name for the branch
 */
export function getDisplayBranchName(branchName: string): string {
  return branchNameMapping[branchName] || branchName;
}
