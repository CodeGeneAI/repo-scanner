import type { Language, Tree } from "web-tree-sitter";
import type {
  ClassInfo,
  FileAnalysis,
  ImportInfo,
  InstantiationInfo,
  InterfaceInfo,
  MethodInfo,
  TypeCheckInfo,
} from "./types";
import { countBranches, findEnclosingFunction } from "./utils";

const GO_BRANCH_TYPES = new Set([
  "if_statement",
  "for_statement",
  "expression_switch_statement",
  "type_switch_statement",
  "select_statement",
  "expression_case",
  "type_case",
  "default_case",
]);

const GO_FUNCTION_TYPES = new Set([
  "function_declaration",
  "method_declaration",
]);

export const extractAll = (
  tree: Tree,
  lang: InstanceType<typeof Language>,
): FileAnalysis => {
  const root = tree.rootNode;
  const classes: ClassInfo[] = [];
  const imports: ImportInfo[] = [];
  const interfaces: InterfaceInfo[] = [];
  const instantiations: InstantiationInfo[] = [];
  const typeChecks: TypeCheckInfo[] = [];

  // --- Structs (treated as classes) ---
  // Collect struct definitions first, then attach methods
  const structMap = new Map<
    string,
    { line: number; fieldCount: number; loc: number }
  >();

  try {
    const structQuery = lang.query(
      "(type_declaration (type_spec name: (type_identifier) @name type: (struct_type) @body))",
    );
    for (const match of structQuery.matches(root)) {
      const nameCapture = match.captures.find((c) => c.name === "name");
      const bodyCapture = match.captures.find((c) => c.name === "body");
      if (!nameCapture || !bodyCapture) continue;

      const bodyNode = bodyCapture.node;
      let fieldCount = 0;
      for (let i = 0; i < bodyNode.childCount; i++) {
        if (bodyNode.child(i)?.type === "field_declaration") fieldCount++;
      }

      structMap.set(nameCapture.node.text, {
        line: nameCapture.node.startPosition.row + 1,
        fieldCount,
        loc: bodyNode.endPosition.row - bodyNode.startPosition.row + 1,
      });
    }
  } catch {
    // struct query failed
  }

  // --- Methods (func with receiver) ---
  const methodsByStruct = new Map<string, MethodInfo[]>();

  try {
    const methodQuery = lang.query(
      "(method_declaration name: (field_identifier) @method_name body: (block) @body)",
    );
    for (const match of methodQuery.matches(root)) {
      const nameCapture = match.captures.find((c) => c.name === "method_name");
      const bodyCapture = match.captures.find((c) => c.name === "body");
      if (!nameCapture) continue;

      // Find receiver type from parent method_declaration
      const methodNode = nameCapture.node.parent!;
      const receiverText = methodNode.text;
      const receiverMatch = /\(\s*\w+\s+\*?(\w+)\)/.exec(receiverText);
      const structName = receiverMatch?.[1] ?? "<unknown>";

      const bodyText = bodyCapture?.node?.text ?? "";

      const method: MethodInfo = {
        name: nameCapture.node.text,
        line: nameCapture.node.startPosition.row + 1,
        complexity:
          1 + countBranches(bodyCapture?.node ?? null, GO_BRANCH_TYPES),
        isOverride: false, // Go has no inheritance
        isEmpty: bodyText.trim() === "{}" || bodyText.trim() === "{ }",
        throwsNotImplemented:
          bodyText.includes("panic(") ||
          bodyText.includes("todo!") ||
          bodyText.includes("unimplemented"),
      };

      const existing = methodsByStruct.get(structName);
      if (existing) existing.push(method);
      else methodsByStruct.set(structName, [method]);
    }
  } catch {
    // method query failed
  }

  // Build classes from structs + methods
  for (const [name, info] of structMap) {
    const methods = methodsByStruct.get(name) ?? [];
    const totalLoc =
      info.loc + methods.reduce((sum, m) => sum + m.complexity, 0);
    classes.push({
      name,
      line: info.line,
      methods,
      fieldCount: info.fieldCount,
      loc: totalLoc,
    });
  }

  // --- Imports ---
  try {
    const importQuery = lang.query(
      "(import_declaration (import_spec path: (interpreted_string_literal) @source))",
    );
    for (const capture of importQuery.captures(root)) {
      if (capture.name !== "source") continue;
      const source = capture.node.text.replace(/"/g, "");
      imports.push({
        source,
        names: [source.split("/").pop() ?? source],
        isTypeOnly: false,
        line: capture.node.startPosition.row + 1,
      });
    }
  } catch {
    // import query failed
  }

  // --- Interfaces ---
  try {
    const ifaceQuery = lang.query(
      "(type_declaration (type_spec name: (type_identifier) @name type: (interface_type) @body))",
    );
    for (const match of ifaceQuery.matches(root)) {
      const nameCapture = match.captures.find((c) => c.name === "name");
      const bodyCapture = match.captures.find((c) => c.name === "body");
      if (!nameCapture || !bodyCapture) continue;

      const methodNames: string[] = [];
      const bodyNode = bodyCapture.node;
      for (let i = 0; i < bodyNode.childCount; i++) {
        const child = bodyNode.child(i);
        if (child?.type === "method_spec") {
          const name = child.childForFieldName("name");
          if (name) methodNames.push(name.text);
        }
      }

      interfaces.push({
        name: nameCapture.node.text,
        line: nameCapture.node.startPosition.row + 1,
        methodCount: methodNames.length,
        methods: methodNames,
      });
    }
  } catch {
    // interface query failed
  }

  // --- Type switches/assertions ---
  try {
    const typeSwitchQuery = lang.query(
      "(type_case type: (type_identifier) @type)",
    );
    for (const capture of typeSwitchQuery.captures(root)) {
      if (capture.name !== "type") continue;
      typeChecks.push({
        checkedType: capture.node.text,
        line: capture.node.startPosition.row + 1,
        inFunction: findEnclosingFunction(capture.node, GO_FUNCTION_TYPES),
      });
    }
  } catch {
    // type switch query failed
  }

  // --- Composite literal instantiations ---
  try {
    const litQuery = lang.query(
      "(composite_literal type: (type_identifier) @type)",
    );
    for (const capture of litQuery.captures(root)) {
      if (capture.name !== "type") continue;
      instantiations.push({
        className: capture.node.text,
        line: capture.node.startPosition.row + 1,
        inFunction: findEnclosingFunction(capture.node, GO_FUNCTION_TYPES),
      });
    }
  } catch {
    // composite literal query failed
  }

  return { classes, imports, interfaces, instantiations, typeChecks };
};
