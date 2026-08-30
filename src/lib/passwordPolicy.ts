// Reglas de fortaleza de contraseña, compartidas entre el registro y el
// cambio de contraseña desde el perfil — un solo lugar para la lógica, así
// nunca se desincroniza qué exige cada pantalla.
export type PasswordRuleId = "min_length" | "uppercase" | "lowercase" | "number" | "special";

export type PasswordRule = {
  id: PasswordRuleId;
  test: (password: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "min_length", test: (pw) => pw.length >= 8 },
  { id: "uppercase", test: (pw) => /[A-Z]/.test(pw) },
  { id: "lowercase", test: (pw) => /[a-z]/.test(pw) },
  { id: "number", test: (pw) => /[0-9]/.test(pw) },
  // Cualquier cosa que no sea letra/número cuenta como "carácter especial"
  // (símbolos, espacios, acentos incluidos) — no hace falta una lista
  // cerrada de símbolos permitidos.
  { id: "special", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export function isPasswordValid(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}
