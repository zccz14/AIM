export const normalizeSqliteDateTime = (value: string) => {
  const trimmedValue = value.trim();
  const sqliteDateTime = trimmedValue.match(
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/,
  );
  const parsedTimestamp = Date.parse(
    sqliteDateTime
      ? `${sqliteDateTime[1]}T${sqliteDateTime[2]}Z`
      : trimmedValue,
  );

  return Number.isNaN(parsedTimestamp)
    ? value
    : new Date(parsedTimestamp).toISOString();
};
