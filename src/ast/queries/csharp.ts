import type { Language, Tree, Node as TSNode } from "web-tree-sitter";
import type {
  ClassInfo,
  FileAnalysis,
  ImportInfo,
  InstantiationInfo,
  InterfaceInfo,
  MethodInfo,
  TypeCheckInfo,
} from "./types";

const BRANCH_TYPES = new Set([
  "if_statement",
  "for_statement",
  "for_each_statement",
  "while_statement",
  "do_statement",
  "catch_clause",
  "switch_section",
  "conditional_expression",
]);

const countBranches = (node: TSNode | null): number => {
  if (!node) return 0;
  let count = 0;
  const walk = (n: TSNode | null): void => {
    if (!n) return;
    if (BRANCH_TYPES.has(n.type)) count++;
    for (let i = 0; i < n.childCount; i++) walk(n.child(i));
  };
  walk(node);
  return count;
};

const findEnclosingFunction = (node: TSNode | null): string => {
  let current = node?.parent;
  while (current) {
    if (
      current.type === "method_declaration" ||
      current.type === "local_function_statement"
    ) {
      const nameNode = current.childForFieldName("name");
      if (nameNode) return nameNode.text;
    }
    current = current.parent;
  }
  return "<module>";
};

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

  // --- Classes ---
  try {
    const classQuery = lang.query(
      "(class_declaration name: (identifier) @class_name body: (declaration_list) @class_body)",
    );
    for (const match of classQuery.matches(root)) {
      const nameCapture = match.captures.find((c) => c.name === "class_name");
      const bodyCapture = match.captures.find((c) => c.name === "class_body");
      if (!nameCapture || !bodyCapture) continue;

      const bodyNode = bodyCapture.node;
      const loc = bodyNode.endPosition.row - bodyNode.startPosition.row + 1;

      const methods: MethodInfo[] = [];
      let fieldCount = 0;

      for (let i = 0; i < bodyNode.childCount; i++) {
        const child = bodyNode.child(i);
        if (!child) continue;

        if (child.type === "method_declaration") {
          const methodName = child.childForFieldName("name");
          const methodBody = child.childForFieldName("body");
          const bodyText = methodBody?.text ?? "";
          const hasOverride = child.text.includes("override ");

          methods.push({
            name: methodName?.text ?? "<anonymous>",
            line: child.startPosition.row + 1,
            complexity: 1 + countBranches(methodBody),
            isOverride: hasOverride,
            isEmpty: bodyText.trim() === "{}" || bodyText.trim() === "{ }",
            throwsNotImplemented:
              bodyText.includes("NotImplementedException") ||
              bodyText.includes("NotSupportedException"),
          });
        } else if (
          child.type === "field_declaration" ||
          child.type === "property_declaration"
        ) {
          fieldCount++;
        }
      }

      // Check base class
      let extendsName: string | undefined;
      const implementsList: string[] = [];
      const classNode = nameCapture.node.parent!;
      for (let i = 0; i < classNode.childCount; i++) {
        const child = classNode.child(i);
        if (child?.type === "base_list") {
          for (let j = 0; j < child.childCount; j++) {
            const base = child.child(j);
            if (base?.type === "identifier" || base?.type === "generic_name") {
              const name = base.text.split("<")[0]!;
              if (name.startsWith("I") && name[1] === name[1]?.toUpperCase()) {
                implementsList.push(name);
              } else if (!extendsName) {
                extendsName = name;
              }
            }
          }
        }
      }

      classes.push({
        name: nameCapture.node.text,
        line: nameCapture.node.startPosition.row + 1,
        methods,
        fieldCount,
        loc,
        extends: extendsName,
        implements: implementsList.length > 0 ? implementsList : undefined,
      });
    }
  } catch {
    /* */
  }

  // --- Imports (using directives) ---
  try {
    const usingQuery = lang.query("(using_directive (identifier) @name)");
    for (const capture of usingQuery.captures(root)) {
      if (capture.name !== "name") continue;
      imports.push({
        source: capture.node.text,
        names: [capture.node.text],
        isTypeOnly: false,
        line: capture.node.startPosition.row + 1,
      });
    }
  } catch {
    /* */
  }

  // --- Interfaces ---
  try {
    const ifaceQuery = lang.query(
      "(interface_declaration name: (identifier) @name body: (declaration_list) @body)",
    );
    for (const match of ifaceQuery.matches(root)) {
      const nameCapture = match.captures.find((c) => c.name === "name");
      const bodyCapture = match.captures.find((c) => c.name === "body");
      if (!nameCapture || !bodyCapture) continue;

      const methodNames: string[] = [];
      const bodyNode = bodyCapture.node;
      for (let i = 0; i < bodyNode.childCount; i++) {
        const child = bodyNode.child(i);
        if (child?.type === "method_declaration") {
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
    /* */
  }

  // --- Instantiations (new X()) ---
  try {
    const newQuery = lang.query(
      "(object_creation_expression type: (identifier) @type)",
    );
    for (const capture of newQuery.captures(root)) {
      if (capture.name !== "type") continue;
      instantiations.push({
        className: capture.node.text,
        line: capture.node.startPosition.row + 1,
        inFunction: findEnclosingFunction(capture.node),
      });
    }
  } catch {
    /* */
  }

  // --- Type checks (is pattern) ---
  try {
    const isQuery = lang.query("(is_expression right: (identifier) @type)");
    for (const capture of isQuery.captures(root)) {
      if (capture.name !== "type") continue;
      typeChecks.push({
        checkedType: capture.node.text,
        line: capture.node.startPosition.row + 1,
        inFunction: findEnclosingFunction(capture.node),
      });
    }
  } catch {
    /* */
  }

  return { classes, imports, interfaces, instantiations, typeChecks };
};
