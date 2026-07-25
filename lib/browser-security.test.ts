import { Auth } from "@auth/core";
import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  getBrowserSecurityHeaders,
  shouldTrustAuthHost,
  shouldUseSecureAuthCookies,
} from "@/lib/browser-security";

function parsePolicy(policy: string) {
  return new Map(
    policy.split(";").map((directive) => {
      const [name, ...values] = directive.trim().split(/\s+/);
      return [name, values] as const;
    }),
  );
}

describe("browser security policy", () => {
  it("denies high-risk embedding and plugin surfaces", () => {
    const directives = parsePolicy(buildContentSecurityPolicy("production"));

    expect(directives.get("base-uri")).toEqual(["'self'"]);
    expect(directives.get("form-action")).toEqual(["'self'"]);
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
    expect(directives.get("frame-src")).toEqual(["'none'"]);
    expect(directives.get("object-src")).toEqual(["'none'"]);
  });

  it("allows the browser origins required by the Next runtime, map and user-owned images", () => {
    const directives = parsePolicy(buildContentSecurityPolicy("production"));

    expect(directives.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directives.get("style-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
      "https://fonts.googleapis.com",
    ]);
    expect(directives.get("font-src")).toEqual([
      "'self'",
      "data:",
      "https://fonts.gstatic.com",
    ]);
    expect(directives.get("img-src")).toEqual(["'self'", "blob:", "data:", "https:"]);
    expect(directives.get("connect-src")).toEqual([
      "'self'",
      "https://services.arcgisonline.com",
      "https://t1.openseamap.org",
    ]);
    expect(directives.get("worker-src")).toEqual(["'self'", "blob:"]);
  });

  it("allows eval only for the Next development runtime", () => {
    expect(parsePolicy(buildContentSecurityPolicy("development")).get("script-src")).toContain(
      "'unsafe-eval'",
    );
    expect(parsePolicy(buildContentSecurityPolicy("production")).get("script-src")).not.toContain(
      "'unsafe-eval'",
    );
  });

  it("returns a single-line enforced CSP with the global security headers", () => {
    const headers = getBrowserSecurityHeaders("production");
    const csp = headers.find((header) => header.key === "Content-Security-Policy");

    expect(csp?.value).toBe(buildContentSecurityPolicy("production"));
    expect(csp?.value).not.toMatch(/[\r\n]/);
    expect(headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
    expect(headers).toContainEqual({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  });

  it("requires secure Auth.js cookies in production without breaking local development", () => {
    expect(shouldUseSecureAuthCookies("production")).toBe(true);
    expect(shouldUseSecureAuthCookies("development")).toBe(false);
    expect(shouldUseSecureAuthCookies("test")).toBe(false);
  });

  it("fails closed without a canonical production auth origin", () => {
    expect(shouldTrustAuthHost("production", undefined)).toBe(false);
    expect(shouldTrustAuthHost("production", "not-a-url")).toBe(false);
    expect(shouldTrustAuthHost("production", "http://fjord-insight.example")).toBe(false);
    expect(shouldTrustAuthHost("production", "https://fjord-insight.example/custom-auth")).toBe(
      false,
    );
    expect(shouldTrustAuthHost("production", "https://fjord-insight.example/?preview=true")).toBe(
      false,
    );
    expect(shouldTrustAuthHost("production", "https://fjord-insight.example")).toBe(true);
    expect(shouldTrustAuthHost("production", "http://localhost:3000")).toBe(true);
    expect(shouldTrustAuthHost("production", "http://[::1]:3000")).toBe(true);
    expect(shouldTrustAuthHost("development", undefined)).toBe(true);
  });

  it("makes Auth.js emit prefixed HttpOnly secure same-site cookies", async () => {
    const response = await Auth(new Request("https://fjord-insight.example/api/auth/csrf"), {
      basePath: "/api/auth",
      providers: [],
      secret: "test-secret-with-at-least-thirty-two-characters",
      trustHost: shouldTrustAuthHost("production", "https://fjord-insight.example"),
      useSecureCookies: shouldUseSecureAuthCookies("production"),
    });
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(setCookie).toContain("__Host-authjs.csrf-token=");
    expect(setCookie).toContain("__Secure-authjs.callback-url=");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
  });
});
