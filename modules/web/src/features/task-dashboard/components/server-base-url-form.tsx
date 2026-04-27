import { useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.js";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "../../../components/ui/field.js";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "../../../components/ui/input-group.js";
import { useI18n } from "../../../lib/i18n.js";
import {
  readServerBaseUrl,
  saveServerBaseUrl,
} from "../../../lib/server-base-url.js";
import { cardHeader, eyebrow, sectionTitle } from "./dashboard-styles.js";

export const ServerBaseUrlForm = ({
  onSave,
}: {
  onSave?: () => Promise<unknown> | unknown;
}) => {
  const { t } = useI18n();
  const [value, setValue] = useState(() => readServerBaseUrl());
  const [savedValue, setSavedValue] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className={cardHeader}>
        <p className={eyebrow}>{t("connection")}</p>
        <CardTitle className={sectionTitle}>{t("serverBaseUrl")}</CardTitle>
        <CardDescription>{t("pointAimNavigator")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Field>
          <FieldLabel htmlFor="server-base-url">SERVER_BASE_URL</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="server-base-url"
              onChange={(event) => {
                setValue(event.currentTarget.value);
                setSavedValue(null);
              }}
              value={value}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                onClick={async () => {
                  setSavedValue(saveServerBaseUrl(value));
                  await onSave?.();
                }}
                variant="secondary"
              >
                {t("save")}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {savedValue ? (
            <FieldDescription>
              {t("saved")}: {savedValue}
            </FieldDescription>
          ) : null}
        </Field>
      </CardContent>
    </Card>
  );
};
