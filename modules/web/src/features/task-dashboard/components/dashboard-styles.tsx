import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Badge } from "../../../components/ui/badge.js";
import { Card } from "../../../components/ui/card.js";
import { cn } from "../../../lib/utils.js";

export const pageStack = "flex flex-col gap-4";
export const sectionStack = "flex flex-col gap-2";
export const panelStack = "flex flex-col gap-2";
export const cockpitRegion = "scroll-mt-4";
export const eyebrow =
  "m-0 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground";
export const sectionTitle = "m-0 text-lg font-medium";
export const pageTitle = "m-0 text-3xl font-medium tracking-tight";
export const sectionCopy = "m-0 text-xs/relaxed text-muted-foreground";
export const tableMeta = "m-0 text-xs/relaxed text-muted-foreground";
export const regionHeader =
  "grid gap-4 border bg-card p-4 md:grid-cols-[minmax(12rem,0.36fr)_minmax(0,1fr)]";
export const cardHeader = "gap-1 py-0";
export const chartFrame = "h-[260px]";
export const taskList = "flex flex-col gap-2";
export const taskListItem =
  "flex items-center justify-between gap-3 border-t py-3 first:border-t-0 first:pt-0 last:pb-0 max-md:flex-col max-md:items-stretch";
export const responsiveTwoGrid = "grid gap-3 md:grid-cols-2";
export const responsiveDetailGrid =
  "grid gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(18rem,1fr)]";
export const metadataList = "grid gap-3";
export const metadataRow = "grid gap-1 break-words";
export const metadataLabel =
  "text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground";
export const mutedText = "text-muted-foreground";
export const actionGroup =
  "m-0 flex min-w-0 flex-wrap gap-3 border-0 p-0 max-md:w-full max-md:[&>*]:flex-1";

export const detailSurface =
  "mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 md:p-6";
export const detailHeader = "flex flex-col gap-4";
export const detailTitleRow =
  "flex flex-wrap items-start justify-between gap-4";
export const detailTitle =
  "m-0 text-3xl font-medium leading-tight tracking-tight";
export const detailSummary =
  "m-0 max-w-3xl text-sm/relaxed text-muted-foreground";
export const detailPanel = "gap-3 p-5";
export const detailPanelHeader = "flex flex-col gap-1";
export const chipList = "flex flex-wrap gap-2";
export const actions = "flex flex-wrap justify-end gap-3";

export const DetailCard = ({
  className,
  ...props
}: React.ComponentProps<typeof Card>) => (
  <Card className={cn(detailPanel, className)} {...props} />
);

export const Kicker = ({ className, ...props }: React.ComponentProps<"p">) => (
  <p className={cn(eyebrow, className)} {...props} />
);

export const Muted = ({ className, ...props }: React.ComponentProps<"p">) => (
  <p
    className={cn("m-0 text-xs/relaxed text-muted-foreground", className)}
    {...props}
  />
);

export const Chip = ({ className, ...props }: React.ComponentProps<"span">) => (
  <Badge className={className} variant="secondary" {...props} />
);

export const Checkmark = ({
  className,
  ...props
}: React.ComponentProps<"span">) => (
  <Badge
    aria-hidden="true"
    className={cn("min-w-5", className)}
    variant="secondary"
    {...props}
  />
);

export const MarkdownContent = ({ children }: { children: string }) => (
  <div className="prose prose-neutral max-w-none text-sm/relaxed text-card-foreground dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:bg-muted [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left">
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
  </div>
);
