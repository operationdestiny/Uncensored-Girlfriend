"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Check, Copy, Pencil, Trash2, X } from "lucide-react";
import { useSiteLanguage } from "@/lib/site-language";
import { MY_BOND_COPY } from "@/lib/my-bond-language";
import { CHARACTER_TOOLS_COPY } from "@/lib/character-tools-language";
import {
  CHARACTER_SHARING_COPY,
  applyMyBondShareLinkLabels
} from "@/lib/character-sharing-language";

// My Bond already uses the old `public` UI key throughout its large dashboard.
// User-created companions are never public now; that key is only a UI alias for
// database visibility `unlisted` (Share by link).
applyMyBondShareLinkLabels(MY_BOND_COPY);

export type UpdatedCompanion = {
  id: string;
  slug: string;
  name: string;
  image: string;
  title: string;
  visibility: "public" | "private";
  creatorUsername?: string;
};

type EditableCompanion = UpdatedCompanion & {
  visualDescription: string;
  description: string;
  temperament: string;
  openingScenario: string;
  firstMessage: string;
};

type Props = {
  companion: UpdatedCompanion;
  session: Session;
  onUpdated: (companion: UpdatedCompanion) => void;
  onDeleted: (characterId: string) => void;
};

export function MyCompanionActions({
  companion,
  session,
  onUpdated,
  onDeleted
}: Props) {
  const { t, language } = useSiteLanguage();
  const copy = MY_BOND_COPY[language] ?? MY_BOND_COPY.EN;
  const tools =
    CHARACTER_TOOLS_COPY[language] ?? CHARACTER_TOOLS_COPY.EN;
  const sharing =
    CHARACTER_SHARING_COPY[language] ?? CHARACTER_SHARING_COPY.EN;

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<EditableCompanion | null>(null);
  const [replacementImage, setReplacementImage] = useState<File | null>(null);
  const [replacementPreview, setReplacementPreview] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    return () => {
      if (replacementPreview.startsWith("blob:")) {
        URL.revokeObjectURL(replacementPreview);
      }
    };
  }, [replacementPreview]);

  function setField<K extends keyof EditableCompanion>(
    key: K,
    value: EditableCompanion[K]
  ) {
    setForm((current) =>
      current ? { ...current, [key]: value } : current
    );
  }

  function shareUrl() {
    if (typeof window === "undefined") return `/chat/${companion.slug}`;
    return `${window.location.origin}/chat/${companion.slug}`;
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2200);
    } catch {
      setError(sharing.copyFailed);
    }
  }

  async function openEditor() {
    setEditOpen(true);
    setLoadingEdit(true);
    setError("");
    setNotice("");
    setLinkCopied(false);
    setReplacementImage(null);
    setReplacementPreview("");

    try {
      const response = await fetch(
        `/api/my-bond/characters/${encodeURIComponent(companion.id)}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          },
          cache: "no-store"
        }
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload?.character) {
        throw new Error(copy.companionUpdateFailed);
      }

      setForm(payload.character as EditableCompanion);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : copy.companionUpdateFailed
      );
    } finally {
      setLoadingEdit(false);
    }
  }

  async function saveCompanion() {
    if (!form || saving) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const body = new FormData();
      body.set("name", form.name.trim());
      body.set("visualDescription", form.visualDescription.trim());
      body.set("description", form.description.trim());
      body.set("temperament", form.temperament.trim());
      body.set("openingScenario", form.openingScenario.trim());
      body.set("firstMessage", form.firstMessage.trim());
      body.set("visibility", form.visibility);

      if (replacementImage) {
        body.set("image", replacementImage);
      }

      const response = await fetch(
        `/api/my-bond/characters/${encodeURIComponent(companion.id)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${session.access_token}`
          },
          body
        }
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload?.character) {
        throw new Error(
          typeof payload?.message === "string"
            ? payload.message
            : copy.companionUpdateFailed
        );
      }

      const updated = payload.character as UpdatedCompanion;
      onUpdated(updated);
      setForm((current) =>
        current
          ? {
              ...current,
              ...updated,
              visualDescription: form.visualDescription,
              description: form.description,
              temperament: form.temperament,
              openingScenario: form.openingScenario,
              firstMessage: form.firstMessage
            }
          : current
      );
      setReplacementImage(null);
      setReplacementPreview("");
      setNotice(copy.companionUpdated);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : copy.companionUpdateFailed
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteCompanion() {
    if (deleting) return;

    setDeleting(true);
    setError("");

    try {
      const response = await fetch(
        `/api/my-bond/characters/${encodeURIComponent(companion.id)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        }
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof payload?.message === "string"
            ? payload.message
            : copy.companionDeleteFailed
        );
      }

      setDeleteOpen(false);
      onDeleted(companion.id);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : copy.companionDeleteFailed
      );
    } finally {
      setDeleting(false);
    }
  }

  const inputClass =
    "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-bond-rose/60";

  return (
    <>
      <button
        type="button"
        onClick={() => void openEditor()}
        className="inline-flex items-center justify-center gap-1.5 rounded-full border border-bond-rose/45 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-bond-rose/10"
      >
        <Pencil size={14} />
        {copy.editCompanion}
      </button>
      <button
        type="button"
        onClick={() => {
          setError("");
          setDeleteOpen(true);
        }}
        className="inline-flex items-center justify-center gap-1.5 rounded-full border border-red-400/35 px-3 py-2.5 text-sm font-bold text-red-100 transition hover:bg-red-500/10"
      >
        <Trash2 size={14} />
        {copy.deleteCompanion}
      </button>

      {editOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setEditOpen(false);
            }
          }}
        >
          <div className="relative my-auto w-full max-w-3xl rounded-[2rem] border border-bond-rose/60 bg-bond-card p-6 shadow-[0_0_42px_rgba(255,92,168,0.25)] md:p-8">
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              disabled={saving}
              className="absolute right-4 top-4 rounded-full bg-black/45 p-2 text-bond-muted hover:text-white disabled:opacity-50"
              aria-label={copy.close}
            >
              <X size={18} />
            </button>

            <h2 className="pr-10 font-display text-3xl font-bold text-bond-rose">
              {copy.editCompanionTitle}
            </h2>

            {loadingEdit || !form ? (
              <p className="mt-8 animate-pulse text-bond-muted">
                {copy.loadingBond}
              </p>
            ) : (
              <div className="mt-7 grid gap-5 md:grid-cols-2">
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-semibold text-bond-muted">
                    {copy.optionalReplacementImage}
                  </span>
                  <div className="flex flex-wrap items-center gap-4">
                    <img
                      src={replacementPreview || form.image}
                      alt=""
                      className="h-32 w-24 rounded-xl object-cover"
                    />
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        setReplacementImage(file);
                        setReplacementPreview(
                          file ? URL.createObjectURL(file) : ""
                        );
                      }}
                      className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-bond-muted file:mr-3 file:rounded-full file:border-0 file:bg-bond-rose file:px-4 file:py-2 file:text-sm file:font-bold file:text-white"
                    />
                  </div>
                  <p className="text-xs text-bond-muted">{tools.imageHelp}</p>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-bond-muted">
                    {t("name")}
                  </span>
                  <input
                    value={form.name}
                    maxLength={30}
                    onChange={(event) => setField("name", event.target.value)}
                    className={inputClass}
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-bond-muted">
                    {t("visualDescription")}
                  </span>
                  <input
                    value={form.visualDescription}
                    maxLength={80}
                    onChange={(event) =>
                      setField("visualDescription", event.target.value)
                    }
                    className={inputClass}
                  />
                </label>

                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-semibold text-bond-muted">
                    {t("describeYourCompanion")}
                  </span>
                  <textarea
                    value={form.description}
                    maxLength={100}
                    rows={3}
                    onChange={(event) =>
                      setField("description", event.target.value)
                    }
                    className={`${inputClass} resize-none`}
                  />
                </label>

                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-semibold text-bond-muted">
                    {t("temperament")}
                  </span>
                  <input
                    value={form.temperament}
                    maxLength={50}
                    onChange={(event) =>
                      setField("temperament", event.target.value)
                    }
                    className={inputClass}
                  />
                </label>

                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-semibold text-bond-muted">
                    {t("openingScenario")}
                  </span>
                  <textarea
                    value={form.openingScenario}
                    maxLength={200}
                    rows={4}
                    onChange={(event) =>
                      setField("openingScenario", event.target.value)
                    }
                    className={`${inputClass} resize-none`}
                  />
                </label>

                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-semibold text-bond-muted">
                    {t("firstMessage")}
                  </span>
                  <textarea
                    value={form.firstMessage}
                    maxLength={100}
                    rows={3}
                    onChange={(event) =>
                      setField("firstMessage", event.target.value)
                    }
                    className={`${inputClass} resize-none`}
                  />
                </label>

                <div className="space-y-3 md:col-span-2">
                  <span className="text-sm font-semibold text-bond-muted">
                    {t("visibility")}
                  </span>
                  <div className="grid gap-3 md:grid-cols-2">
                    {(
                      [
                        {
                          value: "private",
                          label: sharing.private,
                          description: sharing.privateDescription
                        },
                        {
                          value: "public",
                          label: sharing.shareByLink,
                          description: sharing.shareByLinkDescription
                        }
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setField("visibility", option.value)}
                        className={`rounded-2xl border p-4 text-left transition ${
                          form.visibility === option.value
                            ? "border-bond-rose bg-bond-rose/15 text-white"
                            : "border-white/10 bg-white/[0.03] text-bond-muted hover:border-bond-rose/40"
                        }`}
                      >
                        <p className="font-display text-lg font-bold">
                          {option.label}
                        </p>
                        <p className="mt-2 text-sm font-normal leading-6 text-bond-muted">
                          {option.description}
                        </p>
                      </button>
                    ))}
                  </div>

                  {form.visibility === "public" && (
                    <div className="rounded-2xl border border-bond-rose/35 bg-black/25 p-4">
                      <p className="text-sm leading-6 text-bond-muted">
                        {sharing.shareLinkHelp}
                      </p>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <input
                          readOnly
                          value={shareUrl()}
                          className={`${inputClass} min-w-0 flex-1`}
                        />
                        <button
                          type="button"
                          onClick={() => void copyShareLink()}
                          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-bond-rose/55 bg-bond-rose/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-bond-rose/20"
                        >
                          {linkCopied ? <Check size={16} /> : <Copy size={16} />}
                          {linkCopied ? sharing.linkCopied : sharing.copyLink}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {notice && (
              <p className="mt-5 text-sm text-emerald-300">{notice}</p>
            )}
            {error && <p className="mt-5 text-sm text-red-200">{error}</p>}

            {form && !loadingEdit && (
              <button
                type="button"
                onClick={() => void saveCompanion()}
                disabled={saving}
                className="mt-7 w-full rounded-full bg-bond-rose px-6 py-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
              >
                {saving ? copy.savingCompanion : copy.saveCompanion}
              </button>
            )}
          </div>
        </div>
      )}

      {deleteOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting) {
              setDeleteOpen(false);
            }
          }}
        >
          <div className="w-full max-w-md rounded-[2rem] border border-red-400/35 bg-bond-card p-7 text-center shadow-[0_0_38px_rgba(239,68,68,0.16)]">
            <h2 className="font-display text-3xl font-bold text-white">
              {copy.deleteCompanionTitle}
            </h2>
            <p className="mt-4 text-sm leading-7 text-bond-muted">
              {copy.deleteCompanionConfirmation}
            </p>
            {error && <p className="mt-4 text-sm text-red-200">{error}</p>}
            <div className="mt-7 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteOpen(false)}
                className="rounded-full border border-white/10 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void deleteCompanion()}
                className="rounded-full bg-red-500 px-5 py-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
              >
                {deleting ? copy.deletingCompanion : copy.deleteCompanion}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
