def parse_csv_records(file_path, delimiter=","):
    results = []
    errors = []
    line_number = 0

    with open(file_path, "r", encoding="utf-8") as handle:
        header = handle.readline().strip().split(delimiter)

        for raw_line in handle:
            line_number += 1
            stripped = raw_line.strip()
            if not stripped:
                continue

            fields = stripped.split(delimiter)
            if len(fields) != len(header):
                errors.append({
                    "line": line_number,
                    "message": f"Expected {len(header)} fields, got {len(fields)}",
                    "raw": stripped,
                })
                continue

            record = {}
            for idx, col_name in enumerate(header):
                value = fields[idx].strip()
                if value.isdigit():
                    value = int(value)
                record[col_name] = value

            results.append(record)

    return {"records": results, "errors": errors, "total": len(results)}
