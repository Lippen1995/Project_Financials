import {
  buildAnnualReportExtractionFixReport,
  persistAnnualReportExtractionFixArtifacts,
  renderAnnualReportExtractionFixMarkdown,
} from "@/server/services/annual-report-extraction-fix-report-service";

async function main() {
  const report = await buildAnnualReportExtractionFixReport();
  await persistAnnualReportExtractionFixArtifacts(report);

  console.log(renderAnnualReportExtractionFixMarkdown(report));
  console.log("");
  console.log(`JSON: ${report.output.jsonPath}`);
  console.log(`Markdown: ${report.output.markdownPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
