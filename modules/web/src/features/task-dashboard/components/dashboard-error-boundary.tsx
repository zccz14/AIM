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
      <AlertTitle>Panel unavailable</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>{scope} failed to render.</p>
        <p>Direct cause: {getErrorMessage(error)}</p>
        <p className={sectionCopy}>
          Retry this panel after refreshing the dashboard evidence. Other
          Director cockpit sections remain available.
        </p>
        <Button disabled={isRetrying} onClick={() => void handleRetry()}>
          Retry panel
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
