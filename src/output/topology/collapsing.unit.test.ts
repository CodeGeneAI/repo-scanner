import { describe, expect, it } from "bun:test";
import type { Component, PackageDependencyEdge } from "../../types";
import {
  COLLAPSE_ALL_THRESHOLD,
  COLLAPSE_LIBS_THRESHOLD,
  collapseComponents,
  collapseEdges,
  DEV_EDGE_HIDE_THRESHOLD,
} from "./collapsing";

const makeComponent = (name: string, kind: Component["kind"]): Component => ({
  name,
  path: `${kind}s/${name}`,
  kind,
  description: "",
  confidence: 1,
  evidence: [],
});

const makeEdge = (
  from: string,
  to: string,
  isDev = false,
): PackageDependencyEdge => ({
  from,
  to,
  fromName: from,
  toName: to,
  ecosystem: "npm",
  isDev,
});

describe("collapsing thresholds", () => {
  it("COLLAPSE_LIBS_THRESHOLD is 30", () => {
    expect(COLLAPSE_LIBS_THRESHOLD).toBe(30);
  });

  it("COLLAPSE_ALL_THRESHOLD is 80", () => {
    expect(COLLAPSE_ALL_THRESHOLD).toBe(80);
  });

  it("DEV_EDGE_HIDE_THRESHOLD is 100", () => {
    expect(DEV_EDGE_HIDE_THRESHOLD).toBe(100);
  });
});

describe("collapseComponents", () => {
  it("returns all components when count <= COLLAPSE_LIBS_THRESHOLD", () => {
    const components = Array.from({ length: 10 }, (_, i) =>
      makeComponent(`pkg${i}`, "package"),
    );
    const result = collapseComponents(components);
    expect(result.components).toHaveLength(10);
    expect(result.collapsed).toBe(false);
  });

  it("collapses libraries when count > COLLAPSE_LIBS_THRESHOLD", () => {
    const apps = Array.from({ length: 5 }, (_, i) =>
      makeComponent(`app${i}`, "app"),
    );
    const services = Array.from({ length: 5 }, (_, i) =>
      makeComponent(`svc${i}`, "service"),
    );
    const libs = Array.from({ length: 25 }, (_, i) =>
      makeComponent(`lib${i}`, "library"),
    );
    const components = [...apps, ...services, ...libs];
    const result = collapseComponents(components);

    // Apps and services preserved, libraries collapsed
    expect(result.collapsed).toBe(true);
    const appNodes = result.components.filter((c) => c.kind === "app");
    const svcNodes = result.components.filter((c) => c.kind === "service");
    expect(appNodes).toHaveLength(5);
    expect(svcNodes).toHaveLength(5);
    // Libraries should be collapsed into aggregate(s)
    const libNodes = result.components.filter((c) => c.kind === "library");
    expect(libNodes.length).toBeLessThan(25);
    // pathRemapping maps each collapsed lib path to the aggregate path
    expect(result.pathRemapping.size).toBe(25);
    expect(result.pathRemapping.get("librarys/lib0")).toContain(
      "__aggregate__",
    );
  });

  it("aggressively collapses when count > COLLAPSE_ALL_THRESHOLD", () => {
    const apps = Array.from({ length: 5 }, (_, i) =>
      makeComponent(`app${i}`, "app"),
    );
    const services = Array.from({ length: 10 }, (_, i) =>
      makeComponent(`svc${i}`, "service"),
    );
    const packages = Array.from({ length: 40 }, (_, i) =>
      makeComponent(`pkg${i}`, "package"),
    );
    const libs = Array.from({ length: 30 }, (_, i) =>
      makeComponent(`lib${i}`, "library"),
    );
    const components = [...apps, ...services, ...packages, ...libs];
    const result = collapseComponents(components);

    expect(result.collapsed).toBe(true);
    // Apps and services preserved individually
    const appNodes = result.components.filter((c) => c.kind === "app");
    const svcNodes = result.components.filter((c) => c.kind === "service");
    expect(appNodes).toHaveLength(5);
    expect(svcNodes).toHaveLength(10);
    // Packages and libraries collapsed
    expect(result.components.length).toBeLessThan(85);
  });
});

describe("collapseEdges", () => {
  it("returns all edges when count <= DEV_EDGE_HIDE_THRESHOLD", () => {
    const edges = Array.from({ length: 50 }, (_, i) =>
      makeEdge(`a${i}`, `b${i}`),
    );
    const result = collapseEdges(edges);
    expect(result.edges).toHaveLength(50);
    expect(result.collapsed).toBe(false);
  });

  it("filters dev edges when count > DEV_EDGE_HIDE_THRESHOLD", () => {
    const prodEdges = Array.from({ length: 80 }, (_, i) =>
      makeEdge(`a${i}`, `b${i}`, false),
    );
    const devEdges = Array.from({ length: 30 }, (_, i) =>
      makeEdge(`c${i}`, `d${i}`, true),
    );
    const edges = [...prodEdges, ...devEdges];
    const result = collapseEdges(edges);

    expect(result.collapsed).toBe(true);
    expect(result.edges).toHaveLength(80);
    expect(result.edges.every((e) => !e.isDev)).toBe(true);
  });
});
