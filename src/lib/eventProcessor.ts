import type { FilterRule, Template } from "./supabase";
import { cleanMessageForSpeech } from "./voiceManager";

export type ProcessResult = {
  shouldRead: boolean;
  finalText: string;
  reason?: string;
};

export function applyFilters(
  message: string,
  username: string,
  filters: FilterRule[],
  minLen: number,
  maxLen: number
): ProcessResult {
  const trimmed = message.trim();
  if (trimmed.length < minLen) {
    return { shouldRead: false, finalText: "", reason: "Demasiado corto" };
  }
  if (trimmed.length > maxLen) {
    return { shouldRead: false, finalText: "", reason: "Demasiado largo" };
  }

  // Skip messages that are only emojis (spam) — don't read the name either
  const cleaned = cleanMessageForSpeech(trimmed);
  if (!cleaned) {
    return { shouldRead: false, finalText: "", reason: "Solo emojis" };
  }

  const enabled = filters.filter((f) => f.enabled);

  for (const f of enabled) {
    if (f.type === "block") {
      if (f.field === "word" && containsWord(trimmed, f.value)) {
        return { shouldRead: false, finalText: "", reason: `Bloqueado: "${f.value}"` };
      }
      if (f.field === "user" && username.toLowerCase().includes(f.value.toLowerCase())) {
        return { shouldRead: false, finalText: "", reason: `Usuario bloqueado` };
      }
      // El campo "value" no se usa para este tipo — es un filtro de
      // presencia ("¿el mensaje tiene algún emoji?"), no de coincidencia
      // exacta. Antes exigía que value fuera literalmente "*", pero ni la
      // base (columna NOT NULL) ni el formulario dejaban crear ese filtro
      // sin escribir un valor, y nada indicaba que tenía que ser ese
      // asterisco exacto — en la práctica, el filtro de emoji nunca
      // bloqueaba nada.
      if (f.field === "emoji" && /[\u{1F000}-\u{1FAFF}]/gu.test(trimmed)) {
        return { shouldRead: false, finalText: "", reason: "Contiene emoji" };
      }
      if (f.field === "regex") {
        try {
          if (new RegExp(f.value, "i").test(trimmed)) {
            return { shouldRead: false, finalText: "", reason: "Regex bloqueado" };
          }
        } catch {
          // invalid regex, skip
        }
      }
    }
  }

  let result = trimmed;

  for (const f of enabled) {
    if (f.type === "replace") {
      if (f.field === "word") {
        const re = new RegExp(escapeRegex(f.value), "gi");
        result = result.replace(re, f.replacement ?? "");
      } else if (f.field === "regex") {
        try {
          result = result.replace(new RegExp(f.value, "gi"), f.replacement ?? "");
        } catch {
          // invalid regex
        }
      }
    }
  }

  for (const f of enabled) {
    if (f.type === "allow") {
      if (f.field === "word" && !containsWord(trimmed, f.value)) {
        return { shouldRead: false, finalText: "", reason: "No contiene palabra requerida" };
      }
    }
  }

  return { shouldRead: true, finalText: result };
}

export function applyTemplate(text: string, username: string, templates: Template[]): string {
  const active = templates.find((t) => t.enabled);
  if (!active) return `${username} dice: ${text}`;
  return active.content
    .replace(/\{user\}/g, username)
    .replace(/\{message\}/g, text)
    .replace(/\{time\}/g, new Date().toLocaleTimeString());
}

function containsWord(text: string, word: string): boolean {
  const re = new RegExp(`\\b${escapeRegex(word)}\\b`, "i");
  return re.test(text);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { cleanMessageForSpeech };
