import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

const schemaSql = readFileSync(
  new URL("./schema.sql", import.meta.url),
  "utf8",
);
const schemaStatements = schemaSql
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);

const execSchemaStatements = (
  database: DatabaseSync,
  predicate: (statement: string) => boolean,
) => {
  for (const statement of schemaStatements) {
    if (predicate(statement)) {
      database.exec(`${statement};`);
    }
  }
};

export const applySqliteSchema = (database: DatabaseSync) => {
  execSchemaStatements(database, () => true);
};

export const applySqliteTableSchema = (database: DatabaseSync) => {
  execSchemaStatements(database, (statement) =>
    /^CREATE TABLE\b/i.test(statement),
  );
};

export const applySqliteIndexSchema = (database: DatabaseSync) => {
  execSchemaStatements(database, (statement) =>
    /^CREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(statement),
  );
};
