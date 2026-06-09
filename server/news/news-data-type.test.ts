import { describe, expect, it } from "vitest";

import { classifyNewsDataType } from "@/server/news/news-data-type";

describe("news data type", () => {
  it("separates company, industry, macro and regulatory information", () => {
    expect(classifyNewsDataType({ sourceId: "oslobors", exposureType: "direct" })).toBe("company");
    expect(classifyNewsDataType({ sourceId: "sodir-news", exposureType: "petroleum" })).toBe("industry");
    expect(classifyNewsDataType({ sourceId: "iea-news" })).toBe("macro");
    expect(classifyNewsDataType({ sourceType: "regulator" })).toBe("regulatory");
  });
});
