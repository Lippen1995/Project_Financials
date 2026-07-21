import { prisma } from "@/lib/prisma";
import { fetchStortingetCases } from "@/integrations/stortinget/stortinget-business-policy-provider";
import { ingestOfficialKnowledgeDocument } from "@/server/knowledge/knowledge-ingestion-service";

function parseOptions(argv: string[]) {
  let session: string | null = null;
  let limit: number | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} krever en verdi.`);
      index += 1;
      return value;
    };
    if (argument === "--session") session = next();
    else if (argument === "--limit") limit = Number(next());
    else throw new Error(`Ukjent argument: ${argument}`);
  }
  if (!session || !/^\d{4}-\d{4}$/.test(session)) {
    throw new Error("--session er påkrevd og må ha formatet ÅÅÅÅ-ÅÅÅÅ.");
  }
  if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit må være et positivt heltall.");
  }
  return { session, limit };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const fetched = await fetchStortingetCases(options.session);
  const documents = options.limit ? fetched.documents.slice(0, options.limit) : fetched.documents;
  const counts: Record<string, number> = {};
  for (const document of documents) {
    const result = await ingestOfficialKnowledgeDocument(document);
    counts[result.status] = (counts[result.status] ?? 0) + 1;
  }
  console.log(JSON.stringify({
    session: options.session,
    fetchedAt: fetched.fetchedAt.toISOString(),
    documentCount: documents.length,
    counts,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
