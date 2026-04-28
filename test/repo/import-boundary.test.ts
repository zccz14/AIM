import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const repoRootUrl = new URL("../../", import.meta.url);
const repoRoot = fileURLToPath(repoRootUrl);
const modulesRoot = join(repoRoot, "modules");
const sourceExtensions = new Set([".ts", ".tsx"]);

type WorkspacePackage = {
  directoryName: string;
  name: string;
};

type ImportSpecifier = {
  line: number;
  specifier: string;
};

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        return listFiles(entryPath);
      }

      if (!entry.isFile()) {
        return [];
      }

      return [entryPath];
    }),
  );

  return files.flat();
}

async function readWorkspacePackages() {
  const moduleDirectories = await readdir(modulesRoot, { withFileTypes: true });
  const packages = await Promise.all(
    moduleDirectories
      .filter((entry) => entry.isDirectory())
      .map(async (entry): Promise<WorkspacePackage> => {
        const packageJson = JSON.parse(
          await readFile(join(modulesRoot, entry.name, "package.json"), "utf8"),
        ) as { name: string };

        return { directoryName: entry.name, name: packageJson.name };
      }),
  );

  return packages;
}

function isProductionSourceFile(path: string) {
  const normalizedPath = path.split(sep).join("/");
  return /^.*\/modules\/[^/]+\/src\/.+\.tsx?$/.test(normalizedPath);
}

function extractImportSpecifiers(filePath: string, sourceText: string) {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers: ImportSpecifier[] = [];

  function pushSpecifier(node: ts.Node, specifier: string) {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    specifiers.push({ line: line + 1, specifier });
  }

  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      pushSpecifier(node, node.moduleSpecifier.text);
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      const [argument] = node.arguments;

      if (argument && ts.isStringLiteral(argument)) {
        pushSpecifier(node, argument.text);
      }
    }

    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      pushSpecifier(node, node.moduleReference.expression.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return specifiers;
}

function workspacePackageForFile(path: string, packages: WorkspacePackage[]) {
  const relativePath = relative(modulesRoot, path).split(sep);
  const [directoryName] = relativePath;

  return packages.find(
    (packageInfo) => packageInfo.directoryName === directoryName,
  );
}

function internalSourcePackageForPath(
  path: string,
  packages: WorkspacePackage[],
) {
  const relativePath = relative(modulesRoot, path).split(sep);
  const [directoryName, sourceDirectory] = relativePath;

  if (sourceDirectory !== "src") {
    return undefined;
  }

  return packages.find(
    (packageInfo) => packageInfo.directoryName === directoryName,
  );
}

function workspacePackageForInternalSpecifier(
  specifier: string,
  packages: WorkspacePackage[],
) {
  return packages.find((packageInfo) => {
    const internalPrefix = `${packageInfo.name}/src`;
    return (
      specifier === internalPrefix || specifier.startsWith(`${internalPrefix}/`)
    );
  });
}

describe("production import boundaries", () => {
  it("uses package entries instead of sibling workspace src internals", async () => {
    const packages = await readWorkspacePackages();
    const sourceFiles = (await listFiles(modulesRoot)).filter((filePath) => {
      const extension = filePath.slice(filePath.lastIndexOf("."));
      return (
        sourceExtensions.has(extension) && isProductionSourceFile(filePath)
      );
    });
    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const sourcePackage = workspacePackageForFile(filePath, packages);

      if (!sourcePackage) {
        continue;
      }

      const sourceText = await readFile(filePath, "utf8");
      const importSpecifiers = extractImportSpecifiers(filePath, sourceText);

      for (const { line, specifier } of importSpecifiers) {
        const internalSpecifierPackage = workspacePackageForInternalSpecifier(
          specifier,
          packages,
        );

        if (internalSpecifierPackage) {
          violations.push(
            `${relative(repoRoot, filePath)}:${line} imports ${specifier}. Use ${internalSpecifierPackage.name} package entry or another exported public contract instead of /src internals.`,
          );
          continue;
        }

        if (!specifier.startsWith(".")) {
          continue;
        }

        const targetPackage = internalSourcePackageForPath(
          join(dirname(filePath), specifier),
          packages,
        );

        if (targetPackage && targetPackage.name !== sourcePackage.name) {
          violations.push(
            `${relative(repoRoot, filePath)}:${line} imports ${specifier}. Use ${targetPackage.name} package entry or another exported public contract instead of sibling /src internals.`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
