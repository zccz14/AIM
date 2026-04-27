import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const sourceRoot = join(repoRoot, "modules/api/src");

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        return listTypeScriptFiles(path);
      }

      return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
    }),
  );

  return files.flat();
}

function isDisposeSymbolName(name: ts.PropertyName): boolean {
  return (
    ts.isComputedPropertyName(name) &&
    ts.isPropertyAccessExpression(name.expression) &&
    ts.isIdentifier(name.expression.expression) &&
    name.expression.expression.text === "Symbol" &&
    (name.expression.name.text === "dispose" ||
      name.expression.name.text === "asyncDispose")
  );
}

describe("standard disposable type policy", () => {
  it("uses Disposable and AsyncDisposable instead of declaring dispose symbol signatures", async () => {
    const offenders: string[] = [];

    for (const filePath of await listTypeScriptFiles(sourceRoot)) {
      const source = await readFile(filePath, "utf8");
      const sourceFile = ts.createSourceFile(
        filePath,
        source,
        ts.ScriptTarget.Latest,
        true,
      );

      const visit = (node: ts.Node) => {
        if (
          (ts.isMethodSignature(node) || ts.isPropertySignature(node)) &&
          isDisposeSymbolName(node.name)
        ) {
          const position = sourceFile.getLineAndCharacterOfPosition(
            node.name.getStart(sourceFile),
          );

          offenders.push(
            `${relative(repoRoot, filePath)}:${position.line + 1}:${position.character + 1}`,
          );
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    }

    expect(offenders).toEqual([]);
  });
});
