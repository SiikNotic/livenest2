import { useState } from "react";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/i18n";
import { supabase, type Template } from "../lib/supabase";
import { Plus, Trash2, LayoutTemplate, Check, Edit2, X } from "lucide-react";

export function TemplatesView() {
  const templates = useStore((s) => s.templates);
  const loadTemplates = useStore((s) => s.loadTemplates);
  const { t } = useI18n();
  const [editing, setEditing] = useState<Template | null>(null);
  const [showForm, setShowForm] = useState(false);

  const setEnabled = async (tmpl: Template, enabled: boolean) => {
    if (enabled) {
      await supabase.from("templates").update({ enabled: false }).neq("id", tmpl.id);
    }
    await supabase.from("templates").update({ enabled }).eq("id", tmpl.id);
    loadTemplates();
  };

  const deleteTemplate = async (id: string) => {
    await supabase.from("templates").delete().eq("id", id);
    loadTemplates();
  };

  const saveTemplate = async (data: { name: string; content: string; id?: string }) => {
    if (data.id) {
      await supabase.from("templates").update({ name: data.name, content: data.content }).eq("id", data.id);
    } else {
      await supabase.from("templates").insert({ name: data.name, content: data.content, enabled: false });
    }
    setEditing(null);
    setShowForm(false);
    loadTemplates();
  };

  const active = templates.find((tmpl) => tmpl.enabled);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card">
        <div className="flex items-center gap-2 mb-2">
          <LayoutTemplate className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-bold">{t("templates_title")}</h2>
        </div>
        <p className="text-xs text-muted mb-3">
          {t("templates_help")}
        </p>
        {active && (
          <div className="bg-primary/10 border border-primary/30 rounded-xl p-3">
            <p className="text-xs text-primary-400 font-semibold mb-1">{t("templates_active")}</p>
            <p className="text-sm font-mono">{active.content}</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-text-soft">{t("templates_count", { n: templates.length })}</h2>
        <button onClick={() => { setShowForm(true); setEditing(null); }} className="btn-primary text-xs">
          <Plus className="w-3.5 h-3.5" /> {t("templates_new")}
        </button>
      </div>

      {(showForm || editing) && (
        <TemplateForm
          template={editing}
          onSave={saveTemplate}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {templates.length === 0 ? (
        <div className="card text-center py-10">
          <LayoutTemplate className="w-8 h-8 text-muted mx-auto mb-2" />
          <p className="text-sm text-muted">{t("templates_no_templates")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((tmpl) => (
            <div key={tmpl.id} className={`card flex items-start gap-3 ${tmpl.enabled ? "border-primary/40" : ""}`}>
              <button
                onClick={() => setEnabled(tmpl, !tmpl.enabled)}
                className={`w-10 h-6 rounded-full transition-all duration-200 flex-shrink-0 relative mt-1 ${
                  tmpl.enabled ? "bg-primary" : "bg-border"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all duration-200 ${
                    tmpl.enabled ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold truncate">{tmpl.name}</h3>
                  {tmpl.enabled && <span className="badge-primary">{t("templates_active")}</span>}
                </div>
                <p className="text-xs text-muted font-mono mt-1 break-words">{tmpl.content}</p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => { setEditing(tmpl); setShowForm(false); }} className="text-muted hover:text-accent transition-colors p-1.5">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => deleteTemplate(tmpl.id)} className="text-muted hover:text-red-400 transition-colors p-1.5">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateForm({ template, onSave, onCancel }: {
  template: Template | null;
  onSave: (data: { name: string; content: string; id?: string }) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(template?.name ?? "");
  const [content, setContent] = useState(template?.content ?? "{user} dice: {message}");

  const submit = () => {
    if (!name.trim() || !content.trim()) return;
    onSave({ name: name.trim(), content: content.trim(), id: template?.id });
  };

  return (
    <div className="card space-y-3 animate-slide-down border-primary/30">
      <h3 className="text-sm font-bold">{template ? t("templates_edit") : t("templates_new_title")}</h3>
      <div>
        <label className="label">{t("templates_name")}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("templates_name_placeholder")} className="input" />
      </div>
      <div>
        <label className="label">{t("templates_content")}</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="{user} dice: {message}"
          className="input resize-none font-mono"
        />
      </div>
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setContent("{user} dice: {message}")} className="badge-muted hover:bg-border">
          {t("templates_preset_default")}
        </button>
        <button onClick={() => setContent("Mensaje de {user}: {message}")} className="badge-muted hover:bg-border">
          {t("templates_preset_msg")}
        </button>
        <button onClick={() => setContent("{message}")} className="badge-muted hover:bg-border">
          {t("templates_preset_msg_only")}
        </button>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={submit} className="btn-primary flex-1">
          <Check className="w-4 h-4" /> {t("templates_save")}
        </button>
        <button onClick={onCancel} className="btn-ghost">
          <X className="w-4 h-4" /> {t("templates_cancel")}
        </button>
      </div>
    </div>
  );
}
