import { Command, Flags } from "@oclif/core";

const getErrorSummary = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export default class ServerStartCommand extends Command {
  static override description = "Start the local AIM API server";

  static override flags = {
    port: Flags.integer({
      description: "Port for the AIM API server",
      min: 1,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(ServerStartCommand);

    if (flags.port !== undefined) {
      process.env.PORT = String(flags.port);
    }

    const { startServer } = await import("@aim-ai/api/server");

    try {
      await startServer();
    } catch (error) {
      this.logToStderr(
        `AIM server failed during optimizer setup: ${getErrorSummary(error)}. Next steps: check Project configuration, OpenCode base URL, workspace/bootstrap, and repository initialization state.`,
      );
      throw error;
    }
  }
}
