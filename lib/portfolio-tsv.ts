export function parseTsv(content: string): Record<string, string>[] {
    const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((line) => line.trim());
    if (lines.length < 2) return [];

    const headers = parseTsvLine(lines[0]);
    return lines.slice(1).map((line) => {
        const values = parseTsvLine(line);
        const row: Record<string, string> = {};
        headers.forEach((header, index) => {
            row[header.trim().toLowerCase()] = (values[index] ?? "").trim();
        });
        return row;
    });
}

function parseTsvLine(line: string): string[] {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (char === "\t" && !inQuotes) {
            values.push(current);
            current = "";
            continue;
        }
        current += char;
    }
    values.push(current);
    return values;
}

export function toTsv(rows: Record<string, string>[], columns: string[]): string {
    const header = columns.join("\t");
    const body = rows.map((row) =>
        columns.map((column) => escapeTsvValue(row[column] ?? "")).join("\t")
    );
    return [header, ...body].join("\n");
}

function escapeTsvValue(value: string): string {
    if (/[\t\n\r"]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

export function parseBoolean(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function normalizeImportKey(value: string): string {
    return value.trim().toLowerCase();
}

export function downloadTextFile(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/tab-separated-values;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}
