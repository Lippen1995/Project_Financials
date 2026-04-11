type NextFetchInit = RequestInit & {
  next?: {
    revalidate?: number;
  };
};

export async function fetchJson<T>(url: string, init?: NextFetchInit, timeoutMs = 7000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const nextConfig = init?.cache || init?.next ? init?.next : { revalidate: 3600 };
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...init?.headers,
      },
      next: nextConfig,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchText(url: string, init?: NextFetchInit, timeoutMs = 7000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const nextConfig = init?.cache || init?.next ? init?.next : { revalidate: 3600 };
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "text/html, text/plain;q=0.9, */*;q=0.8",
        ...init?.headers,
      },
      next: nextConfig,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}
