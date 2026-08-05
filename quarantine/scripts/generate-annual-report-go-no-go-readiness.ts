import {
  buildAnnualReportGoNoGoReadinessReport,
  persistAnnualReportGoNoGoReadinessArtifacts,
  renderAnnualReportGoNoGoReadinessMarkdown,
} from "@/server/services/annual-report-go-no-go-readiness-service";

async function main() {
  const report = await buildAnnualReportGoNoGoReadinessReport();
  await persistAnnualReportGoNoGoReadinessArtifacts(report);

  console.log(renderAnnualReportGoNoGoReadinessMarkdown(report));
  console.log("");
  console.log(`JSON: ${report.output.jsonPath}`);
  console.log(`Markdown: ${report.output.markdownPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
