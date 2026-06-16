/**
 * YAML frontmatter extraction utilities.
 *
 * Parses --- delimited YAML frontmatter from Markdown files.
 * Handles simple values and block/folded scalars (>-, >, |, etc.).
 */

/** Parse frontmatter block from file content. Returns null if not found. */
export function parseFrontmatter(content: string): string | null {
  const match = content.match(/^---\n([\s\S]*?)\n(?:---|\.\.\.)/);
  return match ? match[1] : null;
}

/**
 * Extract a YAML field value from frontmatter, handling folded/block scalars.
 * Supports: simple values, >-, >, |, >+, |+ block scalars.
 */
export function extractFieldValue(fm: string, field: string): string | null {
  const lines = fm.split("\n");
  const prefix = field + ":";
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith(prefix)) continue;
    let val = trimmed.slice(prefix.length).trim();
    // Check if it's a block scalar marker (>-, >, |, etc.)
    if (val === ">-" || val === ">" || val === "|-" || val === "|" || val === ">+" || val === "|+") {
      const parts: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].startsWith(" ") || lines[j].startsWith("\t")) {
          parts.push(lines[j].trim());
        } else {
          break;
        }
      }
      val = val.startsWith("|") ? parts.join("\n") : parts.join(" ");
      return val;
    }

    // Check if it's a YAML list (value is empty, next lines start with "  - ")
    if (val === "") {
      const items: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const listMatch = lines[j].match(/^\s+-\s+(.*)$/);
        if (listMatch) {
          items.push(listMatch[1].trim());
        } else if (lines[j].trim() === "" || lines[j].match(/^\s+#/)) {
          continue;
        } else {
          break;
        }
      }
      if (items.length > 0) {
        return items.join(", ");
      }
    }

    return val;
  }
  return null;
}

/**
 * Extract a nested YAML mapping as key-value pairs.
 * Matches lines indented under `parent:` that are `key: value` pairs.
 * Stops at the next top-level key or blank line gap.
 */
export function extractNestedMapping(fm: string, parent: string): Record<string, string> | null {
  const lines = fm.split("\n");
  const prefix = parent + ":";
  let inBlock = false;
  const result: Record<string, string> = {};

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!inBlock) {
      if (trimmed === prefix || trimmed.startsWith(prefix + " ")) {
        inBlock = true;
      }
      continue;
    }

    // Empty line within block = continuation / separator
    if (trimmed === "") continue;

    // If line doesn't start with whitespace, we've exited the nested block
    if (lines[i] === trimmed) break;

    // Parse key: value pair
    const kvMatch = trimmed.match(/^([\w-]+):\s*(.*)$/);
    if (kvMatch) {
      result[kvMatch[1]] = kvMatch[2].trim();
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Validate basic YAML structure. Returns issues for lines without colons.
 */
export function checkYamlStructure(fm: string, _filePath?: string): string[] {
  const issues: string[] = [];
  const lines = fm.split("\n");
  let inBlockScalar = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (inBlockScalar && trimmed === line) {
      inBlockScalar = false;
    } else if (inBlockScalar) {
      continue;
    }
    if (!trimmed.includes(":")) {
      issues.push(`Invalid YAML line (no colon): "${trimmed.slice(0, 60)}"`);
    } else {
      const val = trimmed.split(":").slice(1).join(":").trim();
      if (val === ">-" || val === ">" || val === "|-" || val === "|" || val === ">+" || val === "|+") {
        inBlockScalar = true;
      }
    }
  }
  return issues;
}
