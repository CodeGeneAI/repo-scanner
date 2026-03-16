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
  "if_expression",
  "if_let_expression",
  "for_expression",
  "while_expression",
  "while_let_expression",
  "match_arm",
  "else_clause",
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
    if (current.type === "function_item") {
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

  // --- Structs + Impl blocks ---
  const structMap = new Map<
    string,
    { line: number; fieldCount: number; loc: number }
  >();

  try {
    const structQuery = lang.query(
      "(struct_item name: (type_identifier) @name body: (field_declaration_list) @body)",
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
    /* */
  }

  // Impl methods
  const methodsByStruct = new Map<string, MethodInfo[]>();
  try {
    const implQuery = lang.query(
      "(impl_item type: (type_identifier) @impl_type body: (declaration_list (function_item name: (identifier) @method_name body: (block) @body)))",
    );
    for (const match of implQuery.matches(root)) {
      const typeCapture = match.captures.find((c) => c.name === "impl_type");
      const nameCapture = match.captures.find((c) => c.name === "method_name");
      const bodyCapture = match.captures.find((c) => c.name === "body");
      if (!typeCapture || !nameCapture) continue;

      const structName = typeCapture.node.text;
      const bodyText = bodyCapture?.node?.text ?? "";

      const method: MethodInfo = {
        name: nameCapture.node.text,
        line: nameCapture.node.startPosition.row + 1,
        complexity: 1 + countBranches(bodyCapture?.node ?? null),
        isOverride: false,
        isEmpty: bodyText.trim() === "{}" || bodyText.trim() === "{ }",
        throwsNotImplemented:
          bodyText.includes("todo!()") ||
          bodyText.includes("unimplemented!()") ||
          bodyText.includes("panic!("),
      };

      const existing = methodsByStruct.get(structName);
      if (existing) existing.push(method);
      else methodsByStruct.set(structName, [method]);
    }
  } catch {
    /* */
  }

  for (const [name, info] of structMap) {
    const methods = methodsByStruct.get(name) ?? [];
    classes.push({
      name,
      line: info.line,
      methods,
      fieldCount: info.fieldCount,
      loc: info.loc + methods.length * 5,
    });
  }

  // --- Imports (use declarations) ---
  try {
    const useQuery = lang.query("(use_declaration argument: (_) @path)");
    for (const capture of useQuery.captures(root)) {
      if (capture.name !== "path") continue;
      const source = capture.node.text;
      const names =
        source
          .split("::")
          .pop()
          ?.replace(/[{}]/g, "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean) ?? [];
      imports.push({
        source,
        names,
        isTypeOnly: false,
        line: capture.node.startPosition.row + 1,
      });
    }
  } catch {
    /* */
  }

  // --- Traits (interfaces) ---
  try {
    const traitQuery = lang.query(
      "(trait_item name: (type_identifier) @name body: (declaration_list) @body)",
    );
    for (const match of traitQuery.matches(root)) {
      const nameCapture = match.captures.find((c) => c.name === "name");
      const bodyCapture = match.captures.find((c) => c.name === "body");
      if (!nameCapture || !bodyCapture) continue;

      const methodNames: string[] = [];
      const bodyNode = bodyCapture.node;
      for (let i = 0; i < bodyNode.childCount; i++) {
        const child = bodyNode.child(i);
        if (
          child?.type === "function_signature_item" ||
          child?.type === "function_item"
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
    /* */
  }

  // --- Match arms as type checks ---
  try {
    const matchQuery = lang.query("(match_arm pattern: (identifier) @pattern)");
    for (const capture of matchQuery.captures(root)) {
      if (capture.name !== "pattern") continue;
      const name = capture.node.text;
      if (name[0] === name[0]?.toUpperCase()) {
        typeChecks.push({
          checkedType: name,
          line: capture.node.startPosition.row + 1,
          inFunction: findEnclosingFunction(capture.node),
        });
      }
    }
  } catch {
    /* */
  }

  // --- Struct instantiations ---
  try {
    const instQuery = lang.query(
      "(struct_expression name: (type_identifier) @type)",
    );
    for (const capture of instQuery.captures(root)) {
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

  return { classes, imports, interfaces, instantiations, typeChecks };
};
