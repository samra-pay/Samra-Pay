/**
 * audit-expo-types.test.ts
 *
 * Unit tests for the pure-logic portions of the audit-expo-types script.
 * We use in-memory fixtures so there is no dependency on the workspace's
 * actual installed packages or pnpm-workspace.yaml contents.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  parsePackageExtensions,
  hasClassComponentDts,
  resolveInstalledPackageDir,
  getMobileExpoPackages,
  getMobileReactNativePackages,
  getMobileTargetPackages,
} from "./audit-expo-types.js";

// ---------------------------------------------------------------------------
// getMobileExpoPackages / getMobileReactNativePackages / getMobileTargetPackages
// ---------------------------------------------------------------------------

describe("getMobileExpoPackages", () => {
  let tmpDir: string;
  let pkgJson: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-test-"));
    pkgJson = path.join(tmpDir, "package.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns only expo-* packages", () => {
    fs.writeFileSync(
      pkgJson,
      JSON.stringify({
        dependencies: { "expo-blur": "~15.0.0", "react-native-screens": "~4.0.0" },
        devDependencies: { "expo-router": "~6.0.0", "some-other-pkg": "^1.0.0" },
      })
    );
    expect(getMobileExpoPackages(pkgJson).sort()).toEqual(["expo-blur", "expo-router"]);
  });

  it("returns an empty array when there are no expo-* packages", () => {
    fs.writeFileSync(
      pkgJson,
      JSON.stringify({ dependencies: { "react-native": "0.81.0" } })
    );
    expect(getMobileExpoPackages(pkgJson)).toEqual([]);
  });
});

describe("getMobileReactNativePackages", () => {
  let tmpDir: string;
  let pkgJson: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-test-"));
    pkgJson = path.join(tmpDir, "package.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns only react-native-* packages (not bare react-native)", () => {
    fs.writeFileSync(
      pkgJson,
      JSON.stringify({
        dependencies: {
          "react-native": "0.81.0",
          "react-native-screens": "~4.0.0",
          "expo-blur": "~15.0.0",
        },
        devDependencies: { "react-native-gesture-handler": "~2.0.0" },
      })
    );
    expect(getMobileReactNativePackages(pkgJson).sort()).toEqual([
      "react-native-gesture-handler",
      "react-native-screens",
    ]);
  });

  it("returns an empty array when there are no react-native-* packages", () => {
    fs.writeFileSync(
      pkgJson,
      JSON.stringify({ dependencies: { "expo-blur": "~15.0.0" } })
    );
    expect(getMobileReactNativePackages(pkgJson)).toEqual([]);
  });
});

describe("getMobileTargetPackages", () => {
  let tmpDir: string;
  let pkgJson: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-test-"));
    pkgJson = path.join(tmpDir, "package.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("combines expo-* and react-native-* packages", () => {
    fs.writeFileSync(
      pkgJson,
      JSON.stringify({
        dependencies: {
          "react-native": "0.81.0",
          "react-native-screens": "~4.0.0",
          "expo-blur": "~15.0.0",
          "some-other-pkg": "^1.0.0",
        },
        devDependencies: { "react-native-gesture-handler": "~2.0.0", "expo-router": "~6.0.0" },
      })
    );
    expect(getMobileTargetPackages(pkgJson).sort()).toEqual([
      "expo-blur",
      "expo-router",
      "react-native-gesture-handler",
      "react-native-screens",
    ]);
  });

  it("excludes the bare react-native package (no trailing dash)", () => {
    fs.writeFileSync(
      pkgJson,
      JSON.stringify({ dependencies: { "react-native": "0.81.0" } })
    );
    // react-native does not start with "expo-" or "react-native-"
    expect(getMobileTargetPackages(pkgJson)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parsePackageExtensions — YAML structural parser
// ---------------------------------------------------------------------------

describe("parsePackageExtensions", () => {
  it("returns an empty map when there are no packageExtensions entries", () => {
    const yaml = `
packages:
  - artifacts/*
autoInstallPeers: false
`;
    expect(parsePackageExtensions(yaml).size).toBe(0);
  });

  it("detects a correctly configured expo-blur entry", () => {
    const yaml = `
packageExtensions:
  expo-blur@*:
    peerDependencies:
      "@types/react": ">=18"
`;
    const exts = parsePackageExtensions(yaml);
    expect(exts.get("expo-blur")).toBe(true);
  });

  it("detects multiple packages in the same section", () => {
    const yaml = `
packageExtensions:
  expo-blur@*:
    peerDependencies:
      "@types/react": ">=18"
  expo-linear-gradient@*:
    peerDependencies:
      "@types/react": ">=18"
  expo-image@*:
    peerDependencies:
      "@types/react": ">=18"
`;
    const exts = parsePackageExtensions(yaml);
    expect(exts.get("expo-blur")).toBe(true);
    expect(exts.get("expo-linear-gradient")).toBe(true);
    expect(exts.get("expo-image")).toBe(true);
  });

  it("returns false when the entry has peerDependencies but omits @types/react", () => {
    const yaml = `
packageExtensions:
  expo-blur@*:
    peerDependencies:
      "some-other-peer": ">=1"
`;
    const exts = parsePackageExtensions(yaml);
    expect(exts.get("expo-blur")).toBe(false);
  });

  it("does NOT pick up expo-* entries outside the packageExtensions section", () => {
    const yaml = `
# expo-blur@*:
#   peerDependencies:
#     "@types/react": ">=18"
overrides:
  expo-blur@*:
    something: else
packageExtensions:
  expo-router@*:
    peerDependencies:
      "@types/react": ">=18"
`;
    const exts = parsePackageExtensions(yaml);
    // expo-blur appears only outside packageExtensions — must not be listed
    expect(exts.has("expo-blur")).toBe(false);
    expect(exts.get("expo-router")).toBe(true);
  });

  it("handles trailing whitespace and comment lines gracefully", () => {
    const yaml = `
packageExtensions:
  # These packages need @types/react as a peer
  expo-blur@*:
    peerDependencies:
      "@types/react": ">=18"   
  # expo-linear-gradient is here too
  expo-linear-gradient@*:
    peerDependencies:
      "@types/react": ">=18"
`;
    const exts = parsePackageExtensions(yaml);
    expect(exts.get("expo-blur")).toBe(true);
    expect(exts.get("expo-linear-gradient")).toBe(true);
  });

  it("returns false when peerDependencies block is absent entirely", () => {
    const yaml = `
packageExtensions:
  expo-blur@*:
    optionalDependencies:
      "@types/react": ">=18"
`;
    const exts = parsePackageExtensions(yaml);
    // Entry exists but has no peerDependencies — should be false, not missing
    expect(exts.get("expo-blur")).toBe(false);
  });

  it("handles the real pnpm-workspace.yaml section without false matches", () => {
    const yaml = `
minimumReleaseAge: 1440

packages:
  - artifacts/*

packageExtensions:
  expo-blur@*:
    peerDependencies:
      "@types/react": ">=18"
  expo-linear-gradient@*:
    peerDependencies:
      "@types/react": ">=18"
  expo-router@*:
    peerDependencies:
      "@types/react": ">=18"
  expo-image@*:
    peerDependencies:
      "@types/react": ">=18"

autoInstallPeers: false
`;
    const exts = parsePackageExtensions(yaml);
    expect(exts.get("expo-blur")).toBe(true);
    expect(exts.get("expo-linear-gradient")).toBe(true);
    expect(exts.get("expo-router")).toBe(true);
    expect(exts.get("expo-image")).toBe(true);
    // Nothing else should bleed in
    expect(exts.has("autoInstallPeers")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasClassComponentDts — filesystem fixture tests
// ---------------------------------------------------------------------------

describe("hasClassComponentDts", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function write(filename: string, content: string) {
    fs.writeFileSync(path.join(tmpDir, filename), content);
  }

  it("returns false for a directory with no .d.ts files", () => {
    write("index.js", "export const x = 1;");
    expect(hasClassComponentDts(tmpDir)).toBe(false);
  });

  it("returns false for a .d.ts with only function components", () => {
    write(
      "index.d.ts",
      `import React from 'react';
export function MyComponent(props: {}): React.JSX.Element;
`
    );
    expect(hasClassComponentDts(tmpDir)).toBe(false);
  });

  it("returns true for namespace-style React.Component (expo-blur pattern)", () => {
    write(
      "BlurView.d.ts",
      `import React from 'react';
export default class BlurView extends React.Component<{}> {
  render(): React.JSX.Element;
}
`
    );
    expect(hasClassComponentDts(tmpDir)).toBe(true);
  });

  it("returns true for namespace-style React.PureComponent", () => {
    write(
      "Pure.d.ts",
      `import React from 'react';
export class PureWidget extends React.PureComponent<{ value: number }> {
  render(): React.JSX.Element;
}
`
    );
    expect(hasClassComponentDts(tmpDir)).toBe(true);
  });

  it("returns true for named-import style (expo-linear-gradient pattern)", () => {
    write(
      "LinearGradient.d.ts",
      `import { Component } from 'react';
export class LinearGradient extends Component<{}> {
  render(): React.JSX.Element;
}
`
    );
    expect(hasClassComponentDts(tmpDir)).toBe(true);
  });

  it("returns true for named-import PureComponent style", () => {
    write(
      "Pure.d.ts",
      `import { PureComponent } from 'react';
export class MyWidget extends PureComponent<{}> {}
`
    );
    expect(hasClassComponentDts(tmpDir)).toBe(true);
  });

  it("finds the class component even when nested in a subdirectory", () => {
    const sub = path.join(tmpDir, "build");
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(
      path.join(sub, "BlurView.d.ts"),
      `export default class BlurView extends React.Component<{}> {}`
    );
    expect(hasClassComponentDts(tmpDir)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveInstalledPackageDir — symlink resolution
// ---------------------------------------------------------------------------

describe("resolveInstalledPackageDir", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "audit-root-"));
    fs.mkdirSync(path.join(tmpRoot, "node_modules"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("returns null when the package is not in node_modules", () => {
    expect(resolveInstalledPackageDir("expo-missing", tmpRoot)).toBeNull();
  });

  it("returns the real path for an existing directory", () => {
    const pkgDir = path.join(tmpRoot, "node_modules", "expo-present");
    fs.mkdirSync(pkgDir, { recursive: true });
    const result = resolveInstalledPackageDir("expo-present", tmpRoot);
    expect(result).not.toBeNull();
    expect(fs.existsSync(result!)).toBe(true);
  });

  it("follows a symlink to the real directory", () => {
    // Simulate the pnpm store layout: real package elsewhere, symlink in node_modules
    const realDir = path.join(tmpRoot, "store", "expo-blur@1.0.0");
    fs.mkdirSync(realDir, { recursive: true });
    const link = path.join(tmpRoot, "node_modules", "expo-blur");
    fs.symlinkSync(realDir, link);

    const result = resolveInstalledPackageDir("expo-blur", tmpRoot);
    expect(result).toBe(realDir);
  });
});
