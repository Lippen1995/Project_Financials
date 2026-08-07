export type SecurityHeader = {
  key: string;
  value: string;
};

export function buildContentSecurityPolicy(environment = process.env.NODE_ENV) {
  const developmentScriptException = environment === "development" ? " 'unsafe-eval'" : "";

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${developmentScriptException}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' blob: data: https:",
    "connect-src 'self' https://services.arcgisonline.com https://t1.openseamap.org https://cache.kartverket.no",
    "worker-src 'self' blob:",
    "media-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function getBrowserSecurityHeaders(environment = process.env.NODE_ENV): SecurityHeader[] {
  return [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(environment) },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
  ];
}

export function shouldUseSecureAuthCookies(environment = process.env.NODE_ENV) {
  return environment === "production";
}

export function shouldTrustAuthHost(
  environment = process.env.NODE_ENV,
  canonicalAuthUrl?: string,
) {
  if (environment !== "production") {
    return true;
  }

  if (!canonicalAuthUrl) {
    return false;
  }

  try {
    const url = new URL(canonicalAuthUrl);
    const isLoopback =
      url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";

    return (
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      (url.protocol === "https:" || (url.protocol === "http:" && isLoopback))
    );
  } catch {
    return false;
  }
}
