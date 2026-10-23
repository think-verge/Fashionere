import { describe, it, expect } from "vitest";
import {
  buildLookElements, childKindForElement, dateFolderName, elementKey, isInBuilder, todayString,
} from "../services/folderLayout.js";

const look = { id: "L1", brand: "Zara", name: "Jacket", images: ["a.jpg", "b.jpg"] };
const garment = {
  garment_id: "g0",
  garment_type: "jacket",
  colors: [{ hex: "#531B20" }, { hex: "#C9A865" }],
  fabrics: [{ name: "suede", image_url: "f.png" }],
  patterns: [],
  flat_url: "flat.png",
};

describe("buildLookElements", () => {
  it("makes shots, silhouette, one colour per swatch, fabrics and patterns", () => {
    const els = buildLookElements(look, [garment]);
    const count = (t: string) => els.filter((e) => e.element_type === t).length;
    expect(count("shot")).toBe(2);
    expect(count("silhouette")).toBe(1);
    expect(count("color")).toBe(2);
    expect(count("fabric")).toBe(1);
    expect(count("pattern")).toBe(0);
  });

  it("gives every element a unique id and a distinct key", () => {
    const els = buildLookElements(look, [garment]);
    expect(new Set(els.map((e) => e.element_id)).size).toBe(els.length);
    expect(new Set(els.map(elementKey)).size).toBe(els.length);
  });

  it("falls back to retail analysis when there are no garments", () => {
    const els = buildLookElements({ ...look, images: [], analysis: { colors: [{ hex: "#fff" }], patterns: [{ value: "plaid" }] } }, []);
    expect(els.map((e) => e.element_type).sort()).toEqual(["color", "pattern"]);
  });
});

describe("folder helpers", () => {
  it("maps element types to child folders", () => {
    expect(childKindForElement("color")).toBe("palettes");
    expect(childKindForElement("shot")).toBe("shots");
  });
  it("names date folders", () => {
    expect(dateFolderName(" oct-2026 ", "2026-10-17")).toBe("oct-2026-2026-10-17");
  });
  it("formats today in a time zone", () => {
    const d = new Date("2026-10-17T23:30:00Z");
    expect(todayString("Asia/Kolkata", d)).toBe("2026-10-18");
    expect(todayString("UTC", d)).toBe("2026-10-17");
    expect(todayString("Not/AZone", d)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("isInBuilder", () => {
  it("treats legacy elements as in the builder, shots never", () => {
    expect(isInBuilder({ element_type: "fabric" })).toBe(true);
    expect(isInBuilder({ element_type: "fabric", in_builder: false })).toBe(false);
    expect(isInBuilder({ element_type: "shot", in_builder: true })).toBe(false);
  });
});
