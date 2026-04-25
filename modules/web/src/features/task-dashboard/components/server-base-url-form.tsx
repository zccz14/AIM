import { useState } from "react";

import { Button } from "../../../components/ui/button.js";
import { Card } from "../../../components/ui/card.js";
import { Input } from "../../../components/ui/input.js";
import { Label } from "../../../components/ui/label.js";
import {
  readServerBaseUrl,
  saveServerBaseUrl,
} from "../../../lib/server-base-url.js";

export const ServerBaseUrlForm = ({
  onSave,
}: {
  onSave?: () => Promise<unknown> | unknown;
}) => {
  const [value, setValue] = useState(() => readServerBaseUrl());
  const [savedValue, setSavedValue] = useState<string | null>(null);

  return (
    <Card>
      <div>
        <p className="eyebrow">Connection</p>
        <h2 className="section-title">Server Base URL</h2>
        <p className="section-copy">
          Point AIM Navigator at the API instance you want to inspect.
        </p>
      </div>
      <div className="server-form">
        <Label>
          <span className="field-label">SERVER_BASE_URL</span>
          <Input
            onChange={(event) => {
              setValue(event.currentTarget.value);
              setSavedValue(null);
            }}
            value={value}
          />
        </Label>
        <Button
          onClick={async () => {
            setSavedValue(saveServerBaseUrl(value));
            await onSave?.();
          }}
        >
          Save
        </Button>
      </div>
      {savedValue ? <p className="muted-text">Saved: {savedValue}</p> : null}
    </Card>
  );
};
