const SERVER_BASE_URL_STORAGE_KEY = "aim.serverBaseUrl";

export const DEFAULT_SERVER_BASE_URL = "https://aim.zccz14.com";

const normalizeServerBaseUrl = (value: string | null | undefined) => {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : DEFAULT_SERVER_BASE_URL;
};

export const readServerBaseUrl = () => {
  if (typeof window === "undefined") {
    return DEFAULT_SERVER_BASE_URL;
  }

  return normalizeServerBaseUrl(
    window.localStorage.getItem(SERVER_BASE_URL_STORAGE_KEY),
  );
};

export const saveServerBaseUrl = (value: string) => {
  const normalizedValue = normalizeServerBaseUrl(value);

  window.localStorage.setItem(SERVER_BASE_URL_STORAGE_KEY, normalizedValue);

  return normalizedValue;
};
