import { Check, X } from "lucide-react";
import { useI18n, type TranslationKey } from "../lib/i18n";
import { PASSWORD_RULES, type PasswordRuleId } from "../lib/passwordPolicy";

const RULE_LABEL_KEYS: Record<PasswordRuleId, TranslationKey> = {
  min_length: "password_rule_min_length",
  uppercase: "password_rule_uppercase",
  lowercase: "password_rule_lowercase",
  number: "password_rule_number",
  special: "password_rule_special",
};

/** Checklist de requisitos de contraseña que se actualiza en vivo con cada
 *  tecla — se le pasa el valor actual del campo, no maneja estado propio.
 *  Usado tanto en el registro como en "cambiar/establecer contraseña". */
export function PasswordRequirements({ password }: { password: string }) {
  const { t } = useI18n();
  return (
    <ul className="mt-2 space-y-1">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li
            key={rule.id}
            className={`flex items-center gap-1.5 text-[11px] transition-colors ${
              met ? "text-success-400" : "text-muted"
            }`}
          >
            {met ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : <X className="w-3.5 h-3.5 flex-shrink-0" />}
            {t(RULE_LABEL_KEYS[rule.id])}
          </li>
        );
      })}
    </ul>
  );
}
