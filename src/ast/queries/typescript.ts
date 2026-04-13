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
import {
  bodyThrowsNotImplemented,
  compileQuery,
  countBranches,
  findCapture,
  findEnclosingFunction,
  isEmptyBody,
} from "./utils";

const TS_BRANCH_TYPES = new Set([
  "if_statement",
  "for_statement",
  "for_in_statement",
  "while_statement",
  "do_statement",
  "switch_case",
  "catch_clause",
  "ternary_expression",
]);

const TS_FUNCTION_TYPES = new Set([
  "function_declaration",
  "method_definition",
  "arrow_function",
]);

export const extractAll = (tree: Tree, lang: Language): FileAnalysis => {
  const root = tree.rootNode;
  const classes: ClassInfo[] = [];
  const imports: ImportInfo[] = [];
  const interfaces: InterfaceInfo[] = [];
  const instantiations: InstantiationInfo[] = [];
  const typeChecks: TypeCheckInfo[] = [];

  // --- Classes and Methods ---
  const classQuery = compileQuery(
    lang,
    "(class_declaration name: (type_identifier) @class_name body: (class_body) @class_body)",
  );
  const classMatches = classQuery.matches(root);

  for (const match of classMatches) {
    const nameCapture = findCapture(match, "class_name");
    const bodyCapture = findCapture(match, "class_body");
    if (!nameCapture || !bodyCapture) continue;

    const className = nameCapture.node.text;
    const classLine = nameCapture.node.startPosition.row + 1;
    const bodyNode = bodyCapture.node;
    const classLoc = bodyNode.endPosition.row - bodyNode.startPosition.row + 1;

    // Extract methods
    const methods: MethodInfo[] = [];
    let fieldCount = 0;

    for (let i = 0; i < bodyNode.childCount; i++) {
      const child = bodyNode.child(i);
      if (!child) continue;

      if (child.type === "method_definition") {
        const methodName = child.childForFieldName("name");
        const methodBody = child.childForFieldName("body");
        const hasOverride = child.text.includes("override ");

        methods.push({
          name: methodName?.text ?? "<anonymous>",
          line: child.startPosition.row + 1,
          complexity: 1 + countBranches(methodBody, TS_BRANCH_TYPES),
          isOverride: hasOverride,
          isEmpty: isEmptyBody(methodBody),
          throwsNotImplemented: bodyThrowsNotImplemented(methodBody),
        });
      } else if (
        child.type === "public_field_definition" ||
        child.type === "property_declaration"
      ) {
        fieldCount++;
      }
    }

    // Check heritage (extends/implements)
    let extendsName: string | undefined;
    const implementsList: string[] = [];
    const heritage = match.captures[0]?.node.parent;
    if (heritage) {
      for (let i = 0; i < heritage.childCount; i++) {
        const hChild = heritage.child(i);
        if (!hChild) continue;
        if (hChild.type === "class_heritage") {
          const text = hChild.text;
          const extendsMatch = /extends\s+(\w+)/.exec(text);
          if (extendsMatch) extendsName = extendsMatch[1];
          const implMatch = /implements\s+(.+)/.exec(text);
          if (implMatch) {
            implementsList.push(
              ...implMatch[1]!
                .split(",")
                .map((segment: string) => segment.trim().split("<")[0]!),
            );
          }
        }
      }
    }

    classes.push({
      name: className,
      line: classLine,
      methods,
      fieldCount,
      loc: classLoc,
      extends: extendsName,
      implements: implementsList.length > 0 ? implementsList : undefined,
    });
  }

  // --- Imports ---
  const importQuery = compileQuery(
    lang,
    "(import_statement source: (string) @source)",
  );
  for (const capture of importQuery.captures(root)) {
    if (capture.name !== "source") continue;
    const importNode = capture.node.parent!;
    const isTypeOnly = importNode.text.startsWith("import type");
    const source = capture.node.text.replace(/['"]/g, "");

    // Extract imported names
    const names: string[] = [];
    for (let i = 0; i < importNode.childCount; i++) {
      const child = importNode.child(i);
      if (child?.type === "import_clause") {
        const namedImports = child.text.replace(/[{}]/g, "");
        names.push(
          ...namedImports
            .split(",")
            .map((segment: string) => segment.trim().split(" as ")[0]!)
            .filter(
              (segment: string) => segment.length > 0 && segment !== "type",
            ),
        );
      }
    }

    imports.push({
      source,
      names,
      isTypeOnly,
      line: importNode.startPosition.row + 1,
    });
  }

  // --- Interfaces ---
  try {
    const ifaceQuery = compileQuery(
      lang,
      "(interface_declaration name: (type_identifier) @iface_name body: (interface_body) @iface_body)",
    );
    for (const match of ifaceQuery.matches(root)) {
      const nameCapture = findCapture(match, "iface_name");
      const bodyCapture = findCapture(match, "iface_body");
      if (!nameCapture || !bodyCapture) continue;

      const methodNames: string[] = [];
      const bodyNode = bodyCapture.node;
      for (let i = 0; i < bodyNode.childCount; i++) {
        const child = bodyNode.child(i);
        if (
          child?.type === "method_signature" ||
          child?.type === "property_signature"
        ) {
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
    // interface_declaration may not exist in JS grammar
  }

  // --- Instantiations (new X()) ---
  const newQuery = compileQuery(
    lang,
    "(new_expression constructor: [(identifier) @ctor (member_expression) @ctor])",
  );
  for (const capture of newQuery.captures(root)) {
    if (capture.name !== "ctor") continue;
    const className = capture.node.text.split(".").pop() ?? capture.node.text;
    instantiations.push({
      className,
      line: capture.node.startPosition.row + 1,
      inFunction: findEnclosingFunction(capture.node, TS_FUNCTION_TYPES),
    });
  }

  // --- Type Checks (instanceof) ---
  try {
    const instanceofQuery = compileQuery(
      lang,
      '(binary_expression operator: "instanceof" right: (identifier) @type)',
    );
    for (const capture of instanceofQuery.captures(root)) {
      if (capture.name !== "type") continue;
      typeChecks.push({
        checkedType: capture.node.text,
        line: capture.node.startPosition.row + 1,
        inFunction: findEnclosingFunction(capture.node, TS_FUNCTION_TYPES),
      });
    }
  } catch {
    // Some grammars may not support this query
  }

  return { classes, imports, interfaces, instantiations, typeChecks };
};
