import { describe, expect, it } from "vitest";

import {
  clampNjordPanelWidth,
  NJORD_DEFAULT_PANEL_WIDTH,
} from "@/components/search/ai-search-panel";

describe("clampNjordPanelWidth", () => {
  it("keeps the resizable panel within its desktop limits", () => {
    expect(clampNjordPanelWidth(200, 1_440)).toBe(320);
    expect(clampNjordPanelWidth(520, 1_440)).toBe(520);
    expect(clampNjordPanelWidth(900, 1_440)).toBe(720);
  });

  it("leaves room around the panel in a narrow viewport", () => {
    expect(clampNjordPanelWidth(720, 600)).toBe(576);
  });

  it("keeps the standard width within the allowed range", () => {
    expect(clampNjordPanelWidth(NJORD_DEFAULT_PANEL_WIDTH, 1_440)).toBe(400);
  });
});
