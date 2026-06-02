#!/usr/bin/env python3
import json
import sys
from datetime import date, datetime


def fail(code, message):
    print(json.dumps({"ok": False, "code": code, "error": message}, ensure_ascii=False))
    return 0 if code == "UNAVAILABLE" else 1


def serialize_date(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time()).isoformat()
    return None


def main():
    if len(sys.argv) < 2:
        return fail("BAD_INPUT", "Usage: newsplease-extract.py <url>")

    try:
        from newsplease import NewsPlease
    except ModuleNotFoundError:
        return fail("UNAVAILABLE", "Python package 'news-please' is not installed.")

    url = sys.argv[1]
    try:
        article = NewsPlease.from_url(url)
    except Exception as exc:
        return fail("EXTRACTION_FAILED", str(exc))

    if article is None:
        return fail("EXTRACTION_EMPTY", "news-please returned no article.")

    payload = {
        "ok": True,
        "url": getattr(article, "url", None) or url,
        "title": getattr(article, "title", None),
        "lead": getattr(article, "description", None),
        "mainText": getattr(article, "maintext", None),
        "language": getattr(article, "language", None),
        "authors": getattr(article, "authors", None) or [],
        "imageUrl": getattr(article, "image_url", None),
        "publishedAt": serialize_date(getattr(article, "date_publish", None)),
        "sourceDomain": getattr(article, "source_domain", None),
        "extractor": "news-please",
    }
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
