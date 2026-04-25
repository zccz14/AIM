import { useState } from "react";

import { Button } from "../../../components/ui/button.js";
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
    <section className="surface-panel section-stack">
      <div>
        <p className="eyebrow">Connection</p>
        <h2 className="section-title">Server Base URL</h2>
        <p className="section-copy">
          Point AIM Navigator at the API instance you want to inspect.
        </p>
      </div>
      <div className="server-form">
        <label className="field-stack">
          <span className="field-label">SERVER_BASE_URL</span>
          <input
            className="field-input"
            onChange={(event) => {
              setValue(event.currentTarget.value);
              setSavedValue(null);
            }}
            value={value}
          />
        </label>
        <Button
          onClick={async () => {
            setSavedValue(saveServerBaseUrl(value));
            await onSave?.();
          }}
          variant="primary"
        >
          Save
        </Button>
      </div>
      {savedValue ? <p className="muted-text">Saved: {savedValue}</p> : null}
    </section>
  );
};
