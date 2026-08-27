import { useState } from "react";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/i18n";
import { supabase, type FilterRule } from "../lib/supabase";
import { Plus, Trash2, Filter as FilterIcon, Shield } from "lucide-react";

export function FiltersView() {
  const filters = useStore((s) => s.filters);
  const loadFilters = useStore((s) => s.loadFilters);
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const [showForm, setShowForm] = useState(false);
  const { t } = useI18n();

  const toggleFilter = async (f: FilterRule) => {
    await supabase.from("filters").update({ enabled: !f.enabled }).eq("id", f.id);
    loadFilters();
  };

  const deleteFilter = async (id: string) => {
    await supabase.from("filters").delete().eq("id", id);
    loadFilters();
  };

  const createFilter = async (data: Pick<FilterRule, "type" | "field" | "value" | "replacement">) => {
    await supabase.from("filters").insert({
      type: data.type,
      field: data.field,
      value: data.value,
      replacement: data.replacement ?? null,
      enabled: true,
    });
    setShowForm(false);
    loadFilters();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {settings && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold">{t("filters_length_title")}</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("filters_min_chars")}</label>
              <input
                type="number"
                min={0}
                value={settings.min_message_length}
                onChange={(e) => {
                  const v = parseInt(e.target.value) || 0;
                  saveSettings({ min_message_length: v });
                }}
                className="input"
              />
            </div>
            <div>
              <label className="label">{t("filters_max_chars")}</label>
              <input
                type="number"
                min={1}
                value={settings.max_message_length}
                onChange={(e) => {
                  const v = parseInt(e.target.value) || 200;
                  saveSettings({ max_message_length: v });
                }}
                className="input"
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-text-soft">{t("filters_rules", { n: filters.length })}</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs">
          <Plus className="w-3.5 h-3.5" /> {t("filters_new_rule")}
        </button>
      </div>

      {showForm && <FilterForm onCreate={createFilter} onCancel={() => setShowForm(false)} />}

      {filters.length === 0 ? (
        <div className="card text-center py-10">
          <FilterIcon className="w-8 h-8 text-muted mx-auto mb-2" />
          <p className="text-sm text-muted">{t("filters_no_rules")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filters.map((f) => (
            <FilterRow key={f.id} filter={f} onToggle={() => toggleFilter(f)} onDelete={() => deleteFilter(f.id)} />
          ))}
        </div>
      )}
    </div>
  );

  function FilterRow({ filter, onToggle, onDelete }: { filter: FilterRule; onToggle: () => void; onDelete: () => void }) {
    const typeConfig = {
      block: { label: t("filters_block"), badge: "badge-danger" },
      allow: { label: t("filters_allow"), badge: "badge-success" },
      replace: { label: t("filters_replace"), badge: "badge-accent" },
    }[filter.type];

    return (
      <div className={`card flex items-center gap-3 ${!filter.enabled ? "opacity-50" : ""}`}>
        <button
          onClick={onToggle}
          className={`w-10 h-6 rounded-full transition-all duration-200 flex-shrink-0 relative ${
            filter.enabled ? "bg-primary" : "bg-border"
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all duration-200 ${
              filter.enabled ? "left-[18px]" : "left-0.5"
            }`}
          />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={typeConfig.badge}>{typeConfig.label}</span>
            <span className="text-[11px] text-muted">{filter.field}</span>
          </div>
          <p className="text-sm font-medium truncate">
            {filter.value}
            {filter.replacement && <span className="text-muted"> → {filter.replacement}</span>}
          </p>
        </div>
        <button onClick={onDelete} className="text-muted hover:text-red-400 transition-colors p-1.5">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  }
}

function FilterForm({ onCreate, onCancel }: {
  onCreate: (data: Pick<FilterRule, "type" | "field" | "value" | "replacement">) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [type, setType] = useState<FilterRule["type"]>("block");
  const [field, setField] = useState<FilterRule["field"]>("word");
  const [value, setValue] = useState("");
  const [replacement, setReplacement] = useState("");

  // El campo "emoji" no compara contra ningún valor puntual — bloquea
  // cualquier mensaje que contenga un emoji, así que no tiene sentido
  // pedirle al usuario que escriba algo (la base sí exige un valor no
  // vacío, así que se manda uno fijo por dentro).
  const isEmojiField = field === "emoji";

  const submit = () => {
    if (!isEmojiField && !value.trim()) return;
    onCreate({ type, field, value: isEmojiField ? "emoji" : value.trim(), replacement: replacement.trim() || null });
  };

  return (
    <div className="card space-y-3 animate-slide-down border-primary/30">
      <h3 className="text-sm font-bold">{t("filters_new_filter_title")}</h3>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">{t("filters_action")}</label>
          <select value={type} onChange={(e) => setType(e.target.value as FilterRule["type"])} className="input">
            <option value="block">{t("filters_block")}</option>
            <option value="allow">{t("filters_allow")}</option>
            <option value="replace">{t("filters_replace")}</option>
          </select>
        </div>
        <div>
          <label className="label">{t("filters_field")}</label>
          <select value={field} onChange={(e) => setField(e.target.value as FilterRule["field"])} className="input">
            <option value="word">{t("filters_word")}</option>
            <option value="user">{t("filters_user")}</option>
            <option value="emoji">{t("filters_emoji")}</option>
            <option value="regex">{t("filters_regex")}</option>
          </select>
        </div>
      </div>
      {isEmojiField ? (
        <p className="text-xs text-muted px-1">{t("filters_emoji_hint")}</p>
      ) : (
        <div>
          <label className="label">{t("filters_value")}</label>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={field === "user" ? "@usuario" : field === "regex" ? "\\d+" : "palabra"}
            className="input"
          />
        </div>
      )}
      {type === "replace" && (
        <div>
          <label className="label">{t("filters_replacement")}</label>
          <input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            placeholder={t("filters_replacement_placeholder")}
            className="input"
          />
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button onClick={submit} className="btn-primary flex-1">{t("filters_create")}</button>
        <button onClick={onCancel} className="btn-ghost">{t("filters_cancel")}</button>
      </div>
    </div>
  );
}
