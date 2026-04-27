import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../../components/ui/alert.js";
import { Button } from "../../../components/ui/button.js";
import { useI18n } from "../../../lib/i18n.js";
import { sectionCopy } from "./dashboard-styles.js";

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const DashboardPanelFallback = ({
  error,
  onRetry,
  resetErrorBoundary,
  scope,
}: FallbackProps & {
  onRetry?: () => Promise<unknown> | unknown;
  scope: string;
}) => {
  const { t } = useI18n();
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);

    try {
      await onRetry?.();
      resetErrorBoundary();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <Alert className="border p-4" variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{t("panelUnavailable")}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>
          {scope} {t("panelFailedToRender")}
        </p>
        <p>
          {t("directCause")}: {getErrorMessage(error)}
        </p>
        <p className={sectionCopy}>{t("retryPanelDescription")}</p>
        <Button disabled={isRetrying} onClick={() => void handleRetry()}>
          {t("retryPanel")}
        </Button>
      </AlertDescription>
    </Alert>
  );
};

export const DashboardPanelBoundary = ({
  children,
  onRetry,
  resetKeys,
  scope,
}: {
  children: ReactNode;
  onRetry?: () => Promise<unknown> | unknown;
  resetKeys?: unknown[];
  scope: string;
}) => (
  <ErrorBoundary
    fallbackRender={(props) => (
      <DashboardPanelFallback {...props} onRetry={onRetry} scope={scope} />
    )}
    resetKeys={resetKeys}
  >
    {children}
  </ErrorBoundary>
);
