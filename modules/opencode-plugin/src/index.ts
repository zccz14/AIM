import { fileURLToPath } from "node:url";

import type { Plugin, PluginModule } from "@opencode-ai/plugin";

const packagedSkillsPath = fileURLToPath(
  new URL("../skills/", import.meta.url),
);
type ConfigWithSkills = {
  skills?: {
    paths?: string[];
  };
};

export const AIMOpenCodePlugin: Plugin = async () => ({
  config: async (config) => {
    const configWithSkills = config as typeof config & ConfigWithSkills;
    const paths = configWithSkills.skills?.paths ?? [];

    configWithSkills.skills = {
      ...configWithSkills.skills,
      paths: paths.includes(packagedSkillsPath)
        ? paths
        : [...paths, packagedSkillsPath],
    };
  },
});

const pluginModule = {
  id: "@aim-ai/opencode-plugin",
  server: AIMOpenCodePlugin,
} satisfies PluginModule;

export default pluginModule;
