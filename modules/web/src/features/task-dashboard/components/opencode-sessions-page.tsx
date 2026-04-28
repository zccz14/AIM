import type { OpenCodeSession } from "@aim-ai/contract";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, LoaderCircle } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../../components/ui/alert.js";
import { Badge } from "../../../components/ui/badge.js";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.js";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../../../components/ui/empty.js";
import { Skeleton } from "../../../components/ui/skeleton.js";
import { useI18n } from "../../../lib/i18n.js";
import {
  getOpenCodeSessionsErrorMessage,
  openCodeSessionsQueryOptions,
} from "../queries.js";
import {
  cardHeader,
  eyebrow,
  pageStack,
  sectionCopy,
  sectionTitle,
  tableMeta,
} from "./dashboard-styles.js";

const toStateLabel = (state: OpenCodeSession["state"]) =>
  state.charAt(0).toUpperCase() + state.slice(1);

const getOutcome = (session: OpenCodeSession) =>
  session.value ?? session.reason ?? session.continue_prompt ?? "None";

export const OpenCodeSessionsPage = () => {
  const { t } = useI18n();
  const sessionsQuery = useQuery(openCodeSessionsQueryOptions);

  return (
    <section aria-label={t("openCodeSessionsRegion")} className={pageStack}>
      <Card>
        <CardHeader className={cardHeader}>
          <p className={eyebrow}>{t("sessionLedger")}</p>
          <CardTitle className={sectionTitle}>
            {t("openCodeSessions")}
          </CardTitle>
          <p className={sectionCopy}>{t("openCodeSessionsDescription")}</p>
        </CardHeader>
        <CardContent className={pageStack}>
          {sessionsQuery.isPending ? (
            <div className="flex items-center gap-3">
              <LoaderCircle
                aria-label={t("loadingOpenCodeSessions")}
                className="animate-spin"
                data-icon="inline-start"
              />
              <div className={pageStack}>
                <p className={sectionCopy}>{t("loadingOpenCodeSessions")}</p>
                <Skeleton className="h-3 w-full max-w-sm" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ) : null}

          {sessionsQuery.isError ? (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>{t("openCodeSessionsError")}</AlertTitle>
              <AlertDescription>
                {getOpenCodeSessionsErrorMessage(sessionsQuery.error)}
              </AlertDescription>
            </Alert>
          ) : null}

          {sessionsQuery.isSuccess && sessionsQuery.data.items.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>{t("noOpenCodeSessions")}</EmptyTitle>
                <EmptyDescription>
                  {t("noOpenCodeSessionsDescription")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}

          {sessionsQuery.isSuccess && sessionsQuery.data.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr>
                    <th className="border-t bg-muted p-4 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground first:border-t-0">
                      {t("sessionId")}
                    </th>
                    <th className="border-t bg-muted p-4 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground first:border-t-0">
                      {t("tableStatus")}
                    </th>
                    <th className="border-t bg-muted p-4 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground first:border-t-0">
                      {t("updatedAt")}
                    </th>
                    <th className="border-t bg-muted p-4 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground first:border-t-0">
                      {t("sessionSignal")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sessionsQuery.data.items.map((session) => (
                    <tr key={session.session_id}>
                      <td className="border-t p-4 font-mono text-sm">
                        {session.session_id}
                      </td>
                      <td className="border-t p-4">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">
                            {toStateLabel(session.state)}
                          </Badge>
                          {session.stale ? (
                            <Badge variant="destructive">{t("stale")}</Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="border-t p-4">
                        <p className={tableMeta}>{session.updated_at}</p>
                      </td>
                      <td className="border-t p-4">
                        <div className="flex flex-col gap-1">
                          {session.continue_prompt ? (
                            <Badge className="w-fit" variant="outline">
                              {t("continuePromptReady")}
                            </Badge>
                          ) : null}
                          <p className="m-0 max-w-xl text-sm/relaxed">
                            {getOutcome(session)}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
};
