#!/usr/bin/env node

import { run } from "../dist/index.mjs";

await run(process.argv.slice(2));
