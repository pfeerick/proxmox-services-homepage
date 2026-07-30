import { describe, expect, it } from "bun:test";
import { satisfiesMinVersion } from "../src/utils.ts";

describe("satisfiesMinVersion", () => {
  it("is true when current equals min", () => {
    expect(satisfiesMinVersion("1.3.14", "1.3.14")).toBe(true);
  });

  it("is true when current is newer", () => {
    expect(satisfiesMinVersion("1.4.0", "1.3.14")).toBe(true);
    expect(satisfiesMinVersion("2.0.0", "1.3.14")).toBe(true);
    expect(satisfiesMinVersion("1.3.15", "1.3.14")).toBe(true);
  });

  it("is false when current is older", () => {
    expect(satisfiesMinVersion("1.3.13", "1.3.14")).toBe(false);
    expect(satisfiesMinVersion("1.2.0", "1.3.14")).toBe(false);
    expect(satisfiesMinVersion("0.9.9", "1.3.14")).toBe(false);
  });

  it("treats missing trailing segments as 0", () => {
    expect(satisfiesMinVersion("1.3", "1.3.0")).toBe(true);
    expect(satisfiesMinVersion("1.3", "1.3.1")).toBe(false);
  });

  it("ignores prerelease suffixes rather than rejecting the version", () => {
    // Number("14-canary.1") is NaN, which used to make every comparison false —
    // the startup gate then refused to run on a newer Bun than the pinned one.
    expect(satisfiesMinVersion("1.4.0-canary.1", "1.3.14")).toBe(true);
    expect(satisfiesMinVersion("1.3.14-canary.20250101", "1.3.14")).toBe(true);
    expect(satisfiesMinVersion("2.0.0-beta.3", "1.3.14")).toBe(true);
  });

  it("still rejects older prerelease builds", () => {
    expect(satisfiesMinVersion("1.3.13-canary.1", "1.3.14")).toBe(false);
    expect(satisfiesMinVersion("1.2.0-beta", "1.3.14")).toBe(false);
  });
});
