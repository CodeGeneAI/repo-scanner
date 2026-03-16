def parse_tsv_data(input_path, separator="\t"):
    output = []
    issues = []
    row_num = 0

    with open(input_path, "r", encoding="utf-8") as fp:
        columns = fp.readline().strip().split(separator)

        for text_line in fp:
            row_num += 1
            cleaned = text_line.strip()
            if not cleaned:
                continue

            values = cleaned.split(separator)
            if len(values) != len(columns):
                issues.append({
                    "line": row_num,
                    "message": f"Expected {len(columns)} fields, got {len(values)}",
                    "raw": cleaned,
                })
                continue

            entry = {}
            for pos, field_name in enumerate(columns):
                cell = values[pos].strip()
                if cell.isdigit():
                    cell = int(cell)
                entry[field_name] = cell

            output.append(entry)

    return {"records": output, "errors": issues, "total": len(output)}
