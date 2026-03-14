import { cocoapodsRegistryClient } from "../registry/cocoapods";
import { conanRegistryClient } from "../registry/conan";
import { cratesRegistryClient } from "../registry/crates-io";
import { goRegistryClient } from "../registry/go-proxy";
import { registerRegistryClient } from "../registry/index";
import { mavenRegistryClient } from "../registry/maven";
// Registry clients
import { npmRegistryClient } from "../registry/npm";
import { nugetRegistryClient } from "../registry/nuget";
import { packagistRegistryClient } from "../registry/packagist";
import { pubDevRegistryClient } from "../registry/pub-dev";
import { pypiRegistryClient } from "../registry/pypi";
import { rubygemsRegistryClient } from "../registry/rubygems";
import { cppParser } from "./cpp";
import { dartParser } from "./dart";
import { dotnetParser } from "./dotnet";
import { goParser } from "./go";
import { javaParser } from "./java";
// Parsers
import { javascriptParser } from "./javascript";
import { phpParser } from "./php";
import { pythonParser } from "./python";
import { registerParser } from "./registry";
import { rubyParser } from "./ruby";
import { rustParser } from "./rust";
import { swiftParser } from "./swift";

// Register all parsers
registerParser(javascriptParser);
registerParser(pythonParser);
registerParser(goParser);
registerParser(rustParser);
registerParser(rubyParser);
registerParser(javaParser);
registerParser(dotnetParser);
registerParser(phpParser);
registerParser(swiftParser);
registerParser(dartParser);
registerParser(cppParser);

// Register all registry clients
registerRegistryClient(npmRegistryClient);
registerRegistryClient(pypiRegistryClient);
registerRegistryClient(goRegistryClient);
registerRegistryClient(cratesRegistryClient);
registerRegistryClient(rubygemsRegistryClient);
registerRegistryClient(mavenRegistryClient);
registerRegistryClient(nugetRegistryClient);
registerRegistryClient(packagistRegistryClient);
registerRegistryClient(cocoapodsRegistryClient);
registerRegistryClient(pubDevRegistryClient);
registerRegistryClient(conanRegistryClient);
