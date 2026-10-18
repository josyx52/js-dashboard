// Titulos de tarefas vem com markdown do Todoist (ex: "Ver ([Assista](https://...))").
// Para mostrar, fica so o texto: links viram o texto do link e somem os
// marcadores de enfase/codigo. O conteudo original fica intacto na BD.
export function plainTitle(s: string): string {
  return s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/\s+\|\s+\)/g, ")")
    .replace(/\s{2,}/g, " ")
    .trim();
}
