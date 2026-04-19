import { Button, Group, Text, TextInput } from "@mantine/core";
import { useState } from "react";

import {
  readServerBaseUrl,
  saveServerBaseUrl,
} from "../../../lib/server-base-url.js";

export const ServerBaseUrlForm = () => {
  const [value, setValue] = useState(() => readServerBaseUrl());
  const [savedValue, setSavedValue] = useState<string | null>(null);

  return (
    <Group align="end">
      <TextInput
        label="SERVER_BASE_URL"
        value={value}
        onChange={(event) => {
          setValue(event.currentTarget.value);
          setSavedValue(null);
        }}
      />
      <Button onClick={() => setSavedValue(saveServerBaseUrl(value))}>
        Save
      </Button>
      {savedValue ? <Text size="sm">Saved: {savedValue}</Text> : null}
    </Group>
  );
};
