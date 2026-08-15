#!/usr/bin/env tsx
/**
 * audit-expo-types.ts
 *
 * Scans every expo-* package listed in the samra-pay-mobile package.json and
 * checks whether its .d.ts files contain class-component declarations
 * (React.Component / React.PureComponent). If so, the package must be listed
 * in the `packageExtensions` section of pnpm-workspace.yaml with an explicit
 * `@types/react` peer dependency so that pnpm injects it — otherwise TypeScript
 * cannot resolve the class-based types and the typecheck breaks.
 *
 * Exit 0  → all class-component Expo packages are covered in packageExtensions.
 * Exit 1  → one or more packages are missing or a declared dep is unresolvable.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Paths (relative to the workspace root — the cwd when we run this)
// ---------------------------------------------------------------------------
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../..");
const MOBILE_PKG_JSON = path.join(
  WORKSPACE_ROOT,
  "artifacts/samra-pay-mobile/package.json"
);
const WORKSPACE_YAML = path.join(WORKSPACE_ROOT, "pnpm-workspace.yaml");

// ---------------------------------------------------------------------------
// 1. Collect all expo-* package names from the mobile app
// ---------------------------------------------------------------------------
export function getMobileExpoPackages(
  pkgJsonPath: string = MOBILE_PKG_JSON
): string[] {
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  return Object.keys(allDeps).filter((name) => name.startsWith("expo-"));
}

// ---------------------------------------------------------------------------
// 2. Structurally parse the packageExtensions section from pnpm-workspace.yaml.
//
//    Returns a Map from bare package name (e.g. "expo-blur") to a boolean
//    that is true when the extension correctly declares an @types/react peer
//    inside the packageExtensions section.
//
//    Algorithm:
//      - Walk lines sequentially.
//      - A non-indented, non-comment line is a top-level YAML key.
//        Track whether we are in the `packageExtensions:` section.
//      - Inside the section, a 2-space-indented `<name>@<ver>:` line opens a
//        new package entry.
//      - A 4-space-indented `peerDependencies:` line inside a package entry
//        opens the peer block.
//      - A 6-space-indented `"@types/react":` or `'@types/react':` or
//        `@types/react:` line inside the peer block marks the package covered.
// ---------------------------------------------------------------------------
export function parsePackageExtensions(
  yamlText: string
): Map<string, boolean> {
  const result = new Map<string, boolean>();
  const lines = yamlText.split("\n");

  let inPackageExtensions = false;
  let currentPkg: string | null = null;
  let inPeerDependencies = false;
  let currentPkgHasTypesReact = false;

  function flushCurrent() {
    if (currentPkg !== null) {
      result.set(currentPkg, currentPkgHasTypesReact);
      currentPkg = null;
      inPeerDependencies = false;
      currentPkgHasTypesReact = false;
    }
  }

  for (const line of lines) {
    // Skip blank lines and comments
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;

    // A line that starts with a non-whitespace, non-comment char is a
    // top-level key — it ends the current section.
    if (/^\S/.test(line)) {
      flushCurrent();
      inPackageExtensions = /^packageExtensions\s*:/.test(line);
      continue;
    }

    if (!inPackageExtensions) continue;

    // 2-space indent — package entry under packageExtensions
    const pkgMatch = line.match(/^  ([^@\s]+)@[^:]*:\s*$/);
    if (pkgMatch) {
      flushCurrent();
      currentPkg = pkgMatch[1];
      continue;
    }

    if (currentPkg === null) continue;

    // 4-space indent — nested key inside a package extension
    if (/^    peerDependencies\s*:/.test(line)) {
      inPeerDependencies = true;
      continue;
    }

    // Reset peer block when we enter a different 4-space-indent key
    if (/^    \S/.test(line) && !/^    peerDependencies/.test(line)) {
      inPeerDependencies = false;
      continue;
    }

    // 6-space indent — peer dependency entry
    if (inPeerDependencies && /^      ['"]?@types\/react['"]?\s*:/.test(line)) {
      currentPkgHasTypesReact = true;
    }
  }

  flushCurrent();
  return result;
}

// ---------------------------------------------------------------------------
// 3. Resolve the installed package directory for a given package name.
//
//    We resolve through the mobile app's own node_modules symlink — this
//    gives us the exact version that pnpm resolved for that workspace member,
//    not an arbitrary version from the shared store.
//
//    Returns null when the package is absent from the mobile app's
//    node_modules (indicating it was declared but never installed).
// ---------------------------------------------------------------------------
export function resolveInstalledPackageDir(
  pkgName: string,
  mobileRoot: string = path.join(WORKSPACE_ROOT, "artifacts/samra-pay-mobile")
): string | null {
  const symlinkPath = path.join(mobileRoot, "node_modules", pkgName);

  if (!fs.existsSync(symlinkPath)) {
    return null;
  }

  try {
    // Follow the symlink so grep can recurse into the real directory tree.
    return fs.realpathSync(symlinkPath);
  } catch {
    // If realpathSync fails, use the symlink path directly.
    return symlinkPath;
  }
}

// ---------------------------------------------------------------------------
// 4. Check whether any .d.ts file inside a directory tree references class
//    components. We catch two declaration styles:
//
//   Style A (namespace):  "extends React.Component<" / "extends React.PureComponent<"
//   Style B (named import): `import { Component } from 'react'`
//                            …followed by `extends Component<` in the same file
//
// The grep covers both by looking for the namespace form OR the bare `extends`
// form (which only appears alongside a React import in Expo .d.ts files).
// ---------------------------------------------------------------------------
export function hasClassComponentDts(pkgDir: string): boolean {
  // Pattern matches both "React.Component<" and bare "extends Component<" /
  // "extends PureComponent<" produced by named imports from 'react'.
  const pattern =
    "React\\.Component<\\|React\\.PureComponent<\\|extends Component<\\|extends PureComponent<";
  try {
    const result = execSync(
      `grep -rl "${pattern}" "${pkgDir}" --include="*.d.ts" 2>/dev/null | head -1`,
      { encoding: "utf8" }
    ).trim();
    return result.length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const expoPackages = getMobileExpoPackages();
  const extensions = parsePackageExtensions(
    fs.readFileSync(WORKSPACE_YAML, "utf8")
  );

  console.log(
    `Auditing ${expoPackages.length} expo-* package(s) from samra-pay-mobile…\n`
  );

  const needsFix: string[] = [];
  const alreadyCovered: string[] = [];
  const unresolvable: string[] = [];
  const noClassComponents: string[] = [];

  for (const pkgName of expoPackages.sort()) {
    const pkgDir = resolveInstalledPackageDir(pkgName);

    if (!pkgDir) {
      // A declared dependency that cannot be resolved is an audit failure —
      // we cannot guarantee it's safe and `pnpm install` should be re-run.
      unresolvable.push(pkgName);
      console.log(
        `  ✗  ${pkgName} — declared in package.json but not found in node_modules (run pnpm install)`
      );
      continue;
    }

    const needsTypes = hasClassComponentDts(pkgDir);

    if (!needsTypes) {
      noClassComponents.push(pkgName);
      console.log(`  ✓  ${pkgName} — no class components in .d.ts files`);
      continue;
    }

    const ext = extensions.get(pkgName);
    if (ext === true) {
      // Entry exists under packageExtensions AND has @types/react peer
      alreadyCovered.push(pkgName);
      console.log(
        `  ✓  ${pkgName} — class components found, covered in packageExtensions`
      );
    } else if (ext === false) {
      // Entry exists under packageExtensions BUT lacks @types/react peer
      needsFix.push(pkgName);
      console.log(
        `  ✗  ${pkgName} — listed in packageExtensions but missing "@types/react" peer`
      );
    } else {
      // Not in packageExtensions at all
      needsFix.push(pkgName);
      console.log(
        `  ✗  ${pkgName} — class components found, MISSING from packageExtensions`
      );
    }
  }

  console.log("\n── Summary ─────────────────────────────────────────────────");
  console.log(`  Packages scanned:          ${expoPackages.length}`);
  console.log(`  No class components:       ${noClassComponents.length}`);
  console.log(`  Covered in extensions:     ${alreadyCovered.length}`);
  console.log(`  Unresolvable (FAIL):       ${unresolvable.length}`);
  console.log(`  MISSING from extensions:   ${needsFix.length}`);

  const totalFailures = needsFix.length + unresolvable.length;

  if (totalFailures > 0) {
    if (needsFix.length > 0) {
      console.log("\n❌ Action required — add or fix the following entries in");
      console.log("   pnpm-workspace.yaml under `packageExtensions:`:\n");
      for (const pkg of needsFix) {
        console.log(`  ${pkg}@*:`);
        console.log(`    peerDependencies:`);
        console.log(`      "@types/react": ">=18"`);
      }
    }
    if (unresolvable.length > 0) {
      console.log("\n❌ Run `pnpm install` to resolve missing packages:");
      for (const pkg of unresolvable) {
        console.log(`  ${pkg}`);
      }
    }
    process.exit(1);
  }

  console.log(
    "\n✅ All class-component Expo packages are covered in packageExtensions."
  );
  process.exit(0);
}

// Only run when executed directly (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
