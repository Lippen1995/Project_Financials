import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value?: number | null) {
  if (value === null || value === undefined) {
    return "Ikke tilgjengelig";
  }

  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value?: number | null) {
  if (value === null || value === undefined) {
    return "Ikke tilgjengelig";
  }

  return new Intl.NumberFormat("nb-NO").format(value);
}

export function formatDate(value?: Date | string | null) {
  if (!value) {
    return "Ikke tilgjengelig";
  }

  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}