#!/usr/bin/env bun
import { getHelpText, parseArgs } from "./cli";
import "./detectors/init";
import { renderJson } from "./output/json";
import { renderTable } from "./output/table";
import { scanRepo } from "./scanner";

const main = async () => {
  const options = parseArgs(process.argv);

  if (options.showHelp) {
    process.stdout.write(getHelpText());
    process.exit(0);
  }

  const result = await scanRepo(options.path);

  if (options.format === "json") {
    renderJson(result, process.stdout);
  } else {
    renderTable(result, process.stdout);
  }
};

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(2);
});
