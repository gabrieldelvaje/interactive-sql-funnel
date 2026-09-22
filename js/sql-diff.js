function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const TOKEN_PATTERN = /--.*$|'(?:''|[^'])*'|\b(?:SELECT|FROM|WHERE|WITH|AS|CASE|WHEN|THEN|END|MIN|COUNT|FILTER|GROUP|BY|AND|OR|NOT|IS|IN|ORDER|DISTINCT)\b|\b(?:TRUE|FALSE|NULL)\b|\b\d+(?:\.\d+)?\b/gi;

function highlightLine(line) {
  let html = "";
  let cursor = 0;
  TOKEN_PATTERN.lastIndex = 0;

  for (const match of line.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    const token = match[0];

    html += escapeHtml(line.slice(cursor, index));

    let className = "";
    if (token.startsWith("--")) className = "sql-comment";
    else if (token.startsWith("'")) className = "sql-string";
    else if (/^(TRUE|FALSE|NULL)$/i.test(token)) className = "sql-boolean";
    else if (/^\d/.test(token)) className = "sql-number";
    else className = "sql-keyword";

    html += `<span class="${className}">${escapeHtml(token)}</span>`;
    cursor = index + token.length;
  }

  html += escapeHtml(line.slice(cursor));
  return html || " ";
}

function matchedCurrentLines(previousLines, currentLines) {
  const rows = previousLines.length + 1;
  const cols = currentLines.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (previousLines[i - 1] === currentLines[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1;
      } else {
        matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
      }
    }
  }

  const matched = new Set();
  let i = previousLines.length;
  let j = currentLines.length;

  while (i > 0 && j > 0) {
    if (previousLines[i - 1] === currentLines[j - 1]) {
      matched.add(j - 1);
      i -= 1;
      j -= 1;
    } else if (matrix[i - 1][j] >= matrix[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  return matched;
}

export function renderSqlDiff(element, previousSql, currentSql) {
  const currentLines = currentSql.split("\n");
  const previousLines = previousSql ? previousSql.split("\n") : [];
  const matched = previousSql
    ? matchedCurrentLines(previousLines, currentLines)
    : new Set(currentLines.map((_, index) => index));

  element.innerHTML = currentLines
    .map((line, index) => {
      const changed = previousSql && !matched.has(index);
      return `<span class="sql-line${changed ? " is-changed" : ""}">${highlightLine(line)}</span>`;
    })
    .join("");
}
