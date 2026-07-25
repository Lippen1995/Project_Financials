import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const shareholderRegisterImport = {
  create: vi.fn(),
  update: vi.fn(),
};

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: vi.fn(async () => ({
    user: { id: "admin-1", email: "admin@example.com", appRole: "ADMIN" },
    error: null,
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    shareholderRegisterImport,
  },
}));

vi.mock("@/server/shareholdings/shareholder-register-repository", () => ({
  getShareholderRegisterImportSummaries: vi.fn(),
}));

describe("POST /api/admin/shareholder-register/imports", () => {
  beforeEach(() => {
    shareholderRegisterImport.create.mockReset();
    shareholderRegisterImport.update.mockReset();
  });

  it("rejects an upload declared larger than the limit before writing metadata", async () => {
    const { POST } = await import(
      "@/app/api/admin/shareholder-register/imports/route"
    );
    const request = new NextRequest(
      "http://localhost/api/admin/shareholder-register/imports",
      {
        method: "POST",
        headers: {
          "content-length": String(1024 ** 3 + 1),
          "content-type": "text/csv",
          "x-file-name": "aksjonaerregister.csv",
          "x-tax-year": "2025",
        },
        body: "organization_number;owner\n",
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(shareholderRegisterImport.create).not.toHaveBeenCalled();
  });

  it("rejects a non-CSV media type before writing metadata", async () => {
    const { POST } = await import(
      "@/app/api/admin/shareholder-register/imports/route"
    );
    const request = new NextRequest(
      "http://localhost/api/admin/shareholder-register/imports",
      {
        method: "POST",
        headers: {
          "content-length": "24",
          "content-type": "application/octet-stream",
          "x-file-name": "aksjonaerregister.csv",
          "x-tax-year": "2025",
        },
        body: "organization_number;owner\n",
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(415);
    expect(shareholderRegisterImport.create).not.toHaveBeenCalled();
  });

  it("rejects a file name without a CSV extension before writing metadata", async () => {
    const { POST } = await import(
      "@/app/api/admin/shareholder-register/imports/route"
    );
    const request = new NextRequest(
      "http://localhost/api/admin/shareholder-register/imports",
      {
        method: "POST",
        headers: {
          "content-length": "24",
          "content-type": "text/csv; charset=utf-8",
          "x-file-name": "aksjonaerregister.exe",
          "x-tax-year": "2025",
        },
        body: "organization_number;owner\n",
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(shareholderRegisterImport.create).not.toHaveBeenCalled();
  });

  it("rejects a streamed CSV without the required shareholder-register header", async () => {
    const { POST } = await import(
      "@/app/api/admin/shareholder-register/imports/route"
    );
    const csv = "column_a;column_b\nvalue_a;value_b\n";
    const request = new NextRequest(
      "http://localhost/api/admin/shareholder-register/imports",
      {
        method: "POST",
        headers: {
          "content-length": String(Buffer.byteLength(csv)),
          "content-type": "text/csv",
          "x-file-name": "aksjonaerregister.csv",
          "x-tax-year": "2025",
        },
        body: csv,
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(shareholderRegisterImport.create).toHaveBeenCalledOnce();
    expect(shareholderRegisterImport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });

  it("rejects a streamed body larger than its declared length", async () => {
    const { POST } = await import(
      "@/app/api/admin/shareholder-register/imports/route"
    );
    const csv = "orgnr;selskap\n1;2\n";
    const request = new NextRequest(
      "http://localhost/api/admin/shareholder-register/imports",
      {
        method: "POST",
        headers: {
          "content-length": String(Buffer.byteLength(csv) - 1),
          "content-type": "text/csv",
          "x-file-name": "aksjonaerregister.csv",
          "x-tax-year": "2025",
        },
        body: csv,
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(shareholderRegisterImport.create).toHaveBeenCalledOnce();
  });
});
