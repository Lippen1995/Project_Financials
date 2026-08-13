export function formatCompanyMapGroupLabel(groupRootName: string) {
  const displayName = groupRootName.trim().replace(/\s+(?:ASA|AS)$/iu, "");
  const alreadyNamesAGroup = /\b(?:group|gruppen|konsern|konsernet)$/iu.test(
    displayName,
  );
  return `Del av ${displayName}${alreadyNamesAGroup ? "" : "-konsernet"}`;
}
