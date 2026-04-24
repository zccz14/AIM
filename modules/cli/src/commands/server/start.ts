import { Command, Flags } from "@oclif/core";

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

    startServer();
  }
}
