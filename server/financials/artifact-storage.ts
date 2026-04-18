import fs from "node:fs/promises";
import path from "node:path";

type StoredArtifact = {
  storageKey: string;
  absolutePath: string;
};

export interface AnnualReportArtifactStorage {
  putArtifact(input: {
    filingId: string;
    artifactType: string;
    filename: string;
    content: Buffer | string;
  }): Promise<StoredArtifact>;
  getArtifactBuffer(storageKey: string): Promise<Buffer>;
}

export class LocalAnnualReportArtifactStorage implements AnnualReportArtifactStorage {
  constructor(private readonly rootDirectory = path.join(process.cwd(), "output", "annual-report-artifacts")) {}

  async putArtifact(input: {
    filingId: string;
    artifactType: string;
    filename: string;
    content: Buffer | string;
  }) {
    const directory = path.join(this.rootDirectory, input.filingId, input.artifactType.toLowerCase());
    await fs.mkdir(directory, { recursive: true });
    const absolutePath = path.join(directory, input.filename);
    await fs.writeFile(absolutePath, input.content);

    return {
      storageKey: path.relative(this.rootDirectory, absolutePath).replace(/\\/g, "/"),
      absolutePath,
    };
  }

  async getArtifactBuffer(storageKey: string) {
    const absolutePath = path.join(this.rootDirectory, storageKey);
    return fs.readFile(absolutePath);
  }
}
