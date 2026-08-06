export function formatCompanyMapGroupLabel(groupRootName: string) {
  const displayName = groupRootName.trim().replace(/\s+(?:ASA|AS)$/iu, "");
  const alreadyNamesAGroup = /\b(?:group|gruppen|konsern)$/iu.test(displayName);
  return `Part of the ${displayName}${alreadyNamesAGroup ? "" : " Group"}`;
}
