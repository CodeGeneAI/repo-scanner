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

const PY_BRANCH_TYPES = new Set([
  "if_statement",
  "for_statement",
  "while_statement",
  "except_clause",
  "conditional_expression",
]);

const PY_FUNCTION_TYPES = new Set(["function_definition"]);

export const extractAll = (tree: Tree, lang: Language): FileAnalysis => {
  const root = tree.rootNode;
  const classes: ClassInfo[] = [];
  const imports: ImportInfo[] = [];
  const interfaces: InterfaceInfo[] = [];
  const instantiations: InstantiationInfo[] = [];
  const typeChecks: TypeCheckInfo[] = [];

  // --- Classes ---
  const classQuery = lang.query(
    "(class_definition name: (identifier) @class_name body: (block) @class_body)",
  );
  for (const match of classQuery.matches(root)) {
    const nameCapture = match.captures.find((c) => c.name === "class_name");
    const bodyCapture = match.captures.find((c) => c.name === "class_body");
    if (!nameCapture || !bodyCapture) continue;

    const className = nameCapture.node.text;
    const bodyNode = bodyCapture.node;
    const loc = bodyNode.endPosition.row - bodyNode.startPosition.row + 1;

    const methods: MethodInfo[] = [];
    let fieldCount = 0;

    for (let i = 0; i < bodyNode.childCount; i++) {
      const child = bodyNode.child(i);
      if (!child) continue;

      if (child.type === "function_definition") {
        const methodName = child.childForFieldName("name");
        const methodBody = child.childForFieldName("body");
        const bodyText = methodBody?.text ?? "";
        const isNoop =
          bodyText.trim() === "pass" ||
          bodyText.trim() === "..." ||
          !bodyText.trim();
        const throwsNI =
          bodyText.includes("NotImplementedError") ||
          bodyText.includes("raise NotImplemented");

        methods.push({
          name: methodName?.text ?? "<anonymous>",
          line: child.startPosition.row + 1,
          complexity: 1 + countBranches(methodBody, PY_BRANCH_TYPES),
          isOverride: bodyText.includes("super()"),
          isEmpty: isNoop,
          throwsNotImplemented: throwsNI,
        });
      } else if (child.type === "expression_statement") {
        const text = child.text;
        if (text.includes("self.") && text.includes("=")) fieldCount++;
      }
    }

    // Check if this is a Protocol/ABC (interface)
    const classNode = nameCapture.node.parent!;
    const classText = classNode.text;
    const isInterface =
      classText.includes("Protocol") ||
      classText.includes("ABC") ||
      classText.includes("@abstractmethod");

    if (isInterface) {
      interfaces.push({
        name: className,
        line: nameCapture.node.startPosition.row + 1,
        methodCount: methods.length,
        methods: methods.map((m) => m.name),
      });
    }

    // Check extends
    let extendsName: string | undefined;
    for (let i = 0; i < classNode.childCount; i++) {
      const child = classNode.child(i);
      if (child?.type === "argument_list") {
        const firstArg = child.child(1); // skip "("
        if (firstArg && firstArg.type === "identifier") {
          extendsName = firstArg.text;
        }
      }
    }

    classes.push({
      name: className,
      line: nameCapture.node.startPosition.row + 1,
      methods,
      fieldCount,
      loc,
      extends: extendsName,
    });
  }

  // --- Imports ---
  try {
    const importQuery = lang.query(
      "[(import_from_statement module_name: (dotted_name) @source) (import_from_statement module_name: (relative_import) @source)]",
    );
    for (const capture of importQuery.captures(root)) {
      if (capture.name !== "source") continue;
      const importNode = capture.node.parent!;
      const names: string[] = [];
      for (let i = 0; i < importNode.childCount; i++) {
        const child = importNode.child(i);
        if (child?.type === "dotted_name" && child !== capture.node) {
          names.push(child.text);
        } else if (child?.type === "aliased_import") {
          const name = child.childForFieldName("name");
          if (name) names.push(name.text);
        }
      }
      imports.push({
        source: capture.node.text,
        names,
        isTypeOnly: false,
        line: importNode.startPosition.row + 1,
      });
    }
  } catch {
    // Fallback: simpler import parsing
  }

  // --- isinstance() calls ---
  try {
    const isinstanceQuery = lang.query(
      '(call function: (identifier) @fn (#eq? @fn "isinstance") arguments: (argument_list (_) (identifier) @type))',
    );
    for (const capture of isinstanceQuery.captures(root)) {
      if (capture.name !== "type") continue;
      typeChecks.push({
        checkedType: capture.node.text,
        line: capture.node.startPosition.row + 1,
        inFunction: findEnclosingFunction(capture.node, PY_FUNCTION_TYPES),
      });
    }
  } catch {
    // isinstance query may fail on some grammars
  }

  // --- Instantiations (ClassName()) ---
  try {
    const callQuery = lang.query("(call function: (identifier) @fn)");
    for (const capture of callQuery.captures(root)) {
      if (capture.name !== "fn") continue;
      const name = capture.node.text;
      // Heuristic: PascalCase function calls are instantiations
      if (name[0] === name[0]?.toUpperCase() && /^[A-Z]/.test(name)) {
        instantiations.push({
          className: name,
          line: capture.node.startPosition.row + 1,
          inFunction: findEnclosingFunction(capture.node, PY_FUNCTION_TYPES),
        });
      }
    }
  } catch {
    // Fallback
  }

  return { classes, imports, interfaces, instantiations, typeChecks };
};
