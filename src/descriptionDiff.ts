export interface DescriptionDiffLine {
  kind: "same" | "added" | "removed";
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

// Compare Markdown source; rendering uses text nodes so diff content cannot execute HTML.
export function diffDescription(before: string, after: string): DescriptionDiffLine[] {
  const lines = (text: string) => text === "" ? [] : text.replace(/\r\n/g, "\n").split("\n");
  const old = lines(before);
  const next = lines(after);
  let prefix = 0;
  while (prefix < old.length && prefix < next.length && old[prefix] === next[prefix]) prefix++;
  let suffix = 0;
  while (suffix < old.length - prefix && suffix < next.length - prefix && old[old.length - suffix - 1] === next[next.length - suffix - 1]) suffix++;
  const a = old.slice(prefix, old.length - suffix);
  const b = next.slice(prefix, next.length - suffix);
  const result: DescriptionDiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  const push = (kind: DescriptionDiffLine["kind"], text: string) => result.push({
    kind, text, oldLine: kind === "added" ? null : oldLine++, newLine: kind === "removed" ? null : newLine++,
  });
  for (const text of old.slice(0, prefix)) push("same", text);
  // Bound memory for very large rewrites; still show the exact removed/added content.
  if ((a.length + 1) * (b.length + 1) > 1_000_000) {
    for (const text of a) push("removed", text);
    for (const text of b) push("added", text);
  } else {
    const width = b.length + 1;
    const table = new Uint32Array((a.length + 1) * width);
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        table[i * width + j] = a[i] === b[j] ? table[(i + 1) * width + j + 1]! + 1
          : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) { push("same", a[i++]!); j++; }
      else if (i < a.length && (j === b.length || table[(i + 1) * width + j]! >= table[i * width + j + 1]!)) push("removed", a[i++]!);
      else push("added", b[j++]!);
    }
  }
  for (const text of old.slice(old.length - suffix)) push("same", text);
  return result;
}
