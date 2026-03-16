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
  "enhanced_for_statement",
  "while_statement",
  "do_statement",
  "catch_clause",
  "switch_label",
  "ternary_expression",
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
      current.type === "constructor_declaration"
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
      "(class_declaration name: (identifier) @class_name body: (class_body) @class_body)",
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
          const hasOverride = child.text.includes("@Override");

          methods.push({
            name: methodName?.text ?? "<anonymous>",
            line: child.startPosition.row + 1,
            complexity: 1 + countBranches(methodBody),
            isOverride: hasOverride,
            isEmpty: bodyText.trim() === "{}" || bodyText.trim() === "{ }",
            throwsNotImplemented:
              bodyText.includes("UnsupportedOperationException") ||
              bodyText.includes("NotImplementedException"),
          });
        } else if (child.type === "field_declaration") {
          fieldCount++;
        }
      }

      // Check superclass/interfaces
      let extendsName: string | undefined;
      const implementsList: string[] = [];
      const classNode = nameCapture.node.parent!;
      for (let i = 0; i < classNode.childCount; i++) {
        const child = classNode.child(i);
        if (child?.type === "superclass") {
          const typeNode = child.child(1); // skip "extends"
          if (typeNode) extendsName = typeNode.text.split("<")[0];
        } else if (child?.type === "super_interfaces") {
          const text = child.text.replace("implements", "").trim();
          implementsList.push(
            ...text.split(",").map((s) => s.trim().split("<")[0]!),
          );
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

  // --- Imports ---
  try {
    const importQuery = lang.query(
      "(import_declaration (scoped_identifier) @source)",
    );
    for (const capture of importQuery.captures(root)) {
      if (capture.name !== "source") continue;
      const source = capture.node.text;
      const name = source.split(".").pop() ?? source;
      imports.push({
        source,
        names: [name],
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
      "(interface_declaration name: (identifier) @name body: (interface_body) @body)",
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
      "(object_creation_expression type: (type_identifier) @type)",
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

  // --- instanceof checks ---
  try {
    const instanceofQuery = lang.query(
      "(instanceof_expression right: (type_identifier) @type)",
    );
    for (const capture of instanceofQuery.captures(root)) {
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
