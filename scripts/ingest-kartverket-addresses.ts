import { createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getLatestKartverketAddressDistribution,
  streamOfficialAddressesFromZip,
} from "@/server/providers/kartverket-address-provider";

const BATCH_SIZE = 1_500;
const MINIMUM_COMPLETE_ADDRESS_COUNT = 500_000;

async function main() {
  const distribution = await getLatestKartverketAddressDistribution();
  const existing = await prisma.officialAddressDataset.findUnique({
    where: { datasetVersion: distribution.datasetVersion },
  });
  if (existing?.status === "READY") {
    console.log(
      `Kartverket dataset ${existing.datasetVersion} is already ready (${existing.addressCount} addresses).`,
    );
    return;
  }
  if (existing) {
    throw new Error(
      `Dataset ${existing.datasetVersion} already exists with status ${existing.status}; inspect it before retrying.`,
    );
  }

  const fetchedAt = new Date();
  const dataset = await prisma.officialAddressDataset.create({
    data: {
      datasetVersion: distribution.datasetVersion,
      status: "INGESTING",
      sourceUrl: distribution.sourceUrl,
      sourceUpdatedAt: distribution.sourceUpdatedAt,
      checksumSha256: "pending",
      coordinateSystem: distribution.coordinateSystem,
      isComplete: false,
      sourceSystem: "KARTVERKET",
      sourceEntityType: "MatrikkelenAddressCsv",
      sourceId: distribution.datasetVersion,
      fetchedAt,
      normalizedAt: fetchedAt,
    },
  });

  try {
    const response = await fetch(distribution.sourceUrl, {
      headers: { Accept: "application/zip" },
    });
    if (!response.ok || !response.body) {
      throw new Error(`Kartverket address download failed with HTTP ${response.status}.`);
    }
    const expectedBytes = Number(response.headers.get("content-length") ?? "0");
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0) {
      throw new Error("Kartverket address download has no valid content length.");
    }

    const checksum = createHash("sha256");
    let downloadedBytes = 0;
    const hashingStream = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        checksum.update(chunk);
        downloadedBytes += chunk.length;
        callback(null, chunk);
      },
    });
    const zipStream = Readable.fromWeb(response.body as never).pipe(hashingStream);
    let batch: Prisma.OfficialAddressCreateManyInput[] = [];
    let addressCount = 0;

    async function flush() {
      if (batch.length === 0) return;
      await prisma.officialAddress.createMany({ data: batch });
      addressCount += batch.length;
      batch = [];
      process.stdout.write(`\rImported ${addressCount.toLocaleString("nb-NO")} official addresses`);
    }

    for await (const address of streamOfficialAddressesFromZip(zipStream)) {
      batch.push({
        datasetId: dataset.id,
        ...address,
        sourceSystem: "KARTVERKET",
        sourceEntityType: "MatrikkelenAddress",
        sourceId: address.officialAddressId,
        fetchedAt,
        normalizedAt: fetchedAt,
      });
      if (batch.length >= BATCH_SIZE) await flush();
    }
    await flush();
    process.stdout.write("\n");

    if (downloadedBytes !== expectedBytes) {
      throw new Error(
        `Kartverket ZIP was truncated: received ${downloadedBytes} of ${expectedBytes} bytes.`,
      );
    }
    if (addressCount < MINIMUM_COMPLETE_ADDRESS_COUNT) {
      throw new Error(
        `Refusing to mark an unexpectedly small national address extract ready (${addressCount}).`,
      );
    }

    const readyAt = new Date();
    await prisma.officialAddressDataset.update({
      where: { id: dataset.id },
      data: {
        status: "READY",
        checksumSha256: checksum.digest("hex"),
        isComplete: true,
        addressCount,
        normalizedAt: readyAt,
        readyAt,
      },
    });
    console.log(`Ready: ${distribution.datasetVersion} (${addressCount} exact street addresses).`);
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : String(error);
    await prisma.officialAddressDataset.update({
      where: { id: dataset.id },
      data: { status: "FAILED", failureReason: failureReason.slice(0, 2_000) },
    });
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
