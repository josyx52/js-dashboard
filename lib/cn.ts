// Junta classes condicionais: cn("a", cond && "b") -> "a b"
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
