// Inline formatting only: escape HTML first, then render paired Markdown
// emphasis markers. No links, arbitrary HTML, or block Markdown allowed.
export function creatorRichText(value) {
  const safe = String(value ?? "").replace(/&/g, "&amp;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  // Consume paired strong markers first, then paired italic markers.
  // Limit formatting to inline spans without newlines or asterisks inside.
  return safe.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, "<em>$1</em>");
}
