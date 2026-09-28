"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSiteLanguage } from "@/lib/site-language";
import { CHARACTER_TOOLS_COPY } from "@/lib/character-tools-language";
import { CHARACTER_SHARING_COPY } from "@/lib/character-sharing-language";
import {
  FINAL_LOCALIZATION_COPY,
  localizedErrorMessage
} from "@/lib/final-localization-language";

type Visibility = "private" | "unlisted";

export function LockedCreateForm() {
  const router = useRouter();
  const { t, language } = useSiteLanguage();
  const copy =
    CHARACTER_TOOLS_COPY[language] ?? CHARACTER_TOOLS_COPY.EN;
  const sharing =
    CHARACTER_SHARING_COPY[language] ?? CHARACTER_SHARING_COPY.EN;
  const finalCopy =
    FINAL_LOCALIZATION_COPY[language] ?? FINAL_LOCALIZATION_COPY.EN;
  const { session, authReady, openAuthModal } = useAuth();

  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [name, setName] = useState("");
  const [visualDescription, setVisualDescription] = useState("");
  const [description, setDescription] = useState("");
  const [temperament, setTemperament] = useState("");
  const [openingScenario, setOpeningScenario] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [visibility, setVisibility] =
    useState<Visibility>("private");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function requireLogin() {
    if (authReady && !session) {
      openAuthModal();
      return false;
    }

    return Boolean(session);
  }

  function handleImage(file: File | null) {
    if (previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }

    if (!file) {
      setProfileImage(null);
      setPreviewUrl("");
      return;
    }

    setProfileImage(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!authReady || !session) {
      openAuthModal();
      return;
    }

    if (!profileImage) {
      setError(copy.imageRequired);
      return;
    }

    if (
      !name.trim() ||
      !visualDescription.trim() ||
      !description.trim() ||
      !temperament.trim() ||
      !openingScenario.trim() ||
      !firstMessage.trim()
    ) {
      setError(copy.fieldsRequired);
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.set("image", profileImage);
      formData.set("name", name.trim());
      formData.set("visualDescription", visualDescription.trim());
      formData.set("description", description.trim());
      formData.set("temperament", temperament.trim());
      formData.set("openingScenario", openingScenario.trim());
      formData.set("firstMessage", firstMessage.trim());
      formData.set("visibility", visibility);

      const response = await fetch("/api/characters", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`
        },
        body: formData
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (payload?.error === "CHARACTER_LIMIT_REACHED") {
          throw new Error(copy.characterLimitReached);
        }

        throw new Error(
          localizedErrorMessage(
            payload?.message ?? payload?.error,
            language,
            copy.createFailed,
            "createCharacter"
          )
        );
      }

      router.push(`/chat/${encodeURIComponent(payload.slug)}`);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : copy.createFailed
      );
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-white outline-none focus:border-bond-rose/60";

  return (
    <div className="ug-create-form">
      <form
        className="ug-create-panel"
        onSubmit={handleSubmit}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <span className="text-sm font-semibold text-bond-muted">
              {t("profileImage")} <span className="text-bond-rose">*</span>
            </span>

            {previewUrl && (
              <div className="mb-3 h-48 w-40 overflow-hidden rounded-2xl border border-bond-rose/35 bg-black">
                <img
                  src={previewUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            <input
              id="profile-image-upload"
              required
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onClick={() => {
                if (!session) openAuthModal();
              }}
              onChange={(event) =>
                handleImage(event.target.files?.[0] ?? null)
              }
              className="sr-only"
              aria-describedby="profile-image-help"
            />
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
              <label
                htmlFor="profile-image-upload"
                className="cursor-pointer rounded-full bg-bond-rose px-4 py-2 text-sm font-bold text-white"
              >
                {finalCopy.chooseImage}
              </label>
              <span className="min-w-0 flex-1 truncate text-sm text-bond-muted">
                {profileImage?.name || finalCopy.noImageSelected}
              </span>
            </div>
            <p id="profile-image-help" className="text-xs text-bond-muted">
              {copy.imageHelp}
            </p>
          </div>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-bond-muted">
              {t("name")} <span className="text-bond-rose">*</span>
            </span>
            <input
              required
              maxLength={30}
              value={name}
              onFocus={() => {
                if (!session) openAuthModal();
              }}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("charactersMax30")}
              className={inputClass}
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-bond-muted">
              {t("visualDescription")} <span className="text-bond-rose">*</span>
            </span>
            <input
              required
              maxLength={80}
              value={visualDescription}
              onFocus={() => {
                if (!session) openAuthModal();
              }}
              onChange={(event) =>
                setVisualDescription(event.target.value)
              }
              placeholder={t("charactersMax80")}
              className={inputClass}
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-semibold text-bond-muted">
              {t("describeYourCompanion")} <span className="text-bond-rose">*</span>
            </span>
            <textarea
              required
              rows={4}
              maxLength={100}
              value={description}
              onFocus={() => {
                if (!session) openAuthModal();
              }}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("describeYourCompanionPlaceholder")}
              className={`${inputClass} resize-none`}
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-semibold text-bond-muted">
              {t("temperament")} <span className="text-bond-rose">*</span>
            </span>
            <input
              required
              maxLength={50}
              value={temperament}
              onFocus={() => {
                if (!session) openAuthModal();
              }}
              onChange={(event) => setTemperament(event.target.value)}
              placeholder={t("describeTheirPersonality")}
              className={inputClass}
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-semibold text-bond-muted">
              {t("openingScenario")} <span className="text-bond-rose">*</span>
            </span>
            <textarea
              required
              maxLength={200}
              rows={4}
              value={openingScenario}
              onFocus={() => {
                if (!session) openAuthModal();
              }}
              onChange={(event) =>
                setOpeningScenario(event.target.value)
              }
              placeholder={t("charactersMax200")}
              className={`${inputClass} resize-none`}
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-semibold text-bond-muted">
              {t("firstMessage")} <span className="text-bond-rose">*</span>
            </span>
            <textarea
              required
              maxLength={100}
              rows={3}
              value={firstMessage}
              onFocus={() => {
                if (!session) openAuthModal();
              }}
              onChange={(event) => setFirstMessage(event.target.value)}
              placeholder={t("charactersMax100")}
              className={`${inputClass} resize-none`}
            />
          </label>

          <div className="space-y-3 md:col-span-2">
            <p className="text-sm font-semibold text-bond-muted">
              {t("visibility")} <span className="text-bond-rose">*</span>
            </p>

            <div className="grid gap-3 md:grid-cols-2">
              {(
                [
                  {
                    value: "private",
                    label: sharing.private,
                    description: sharing.privateDescription
                  },
                  {
                    value: "unlisted",
                    label: sharing.shareByLink,
                    description: sharing.shareByLinkDescription
                  }
                ] as const
              ).map((option) => (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => {
                    if (!requireLogin()) return;
                    setVisibility(option.value);
                  }}
                  className={`rounded-2xl border p-4 text-left transition ${
                    visibility === option.value
                      ? "border-bond-rose bg-bond-rose/15"
                      : "border-white/10 bg-white/[0.03] hover:border-bond-rose/40"
                  }`}
                >
                  <p className="font-display text-lg font-bold text-white">
                    {option.label}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-bond-muted">
                    {option.description}
                  </p>
                  {option.value === "unlisted" && (
                    <p className="mt-2 text-xs leading-5 text-bond-muted/85">
                      {sharing.shareLinkHelp}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-6 rounded-2xl border border-red-400/25 bg-red-500/10 px-5 py-4 text-sm text-red-100">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-8 w-full rounded-full bg-bond-rose px-6 py-3.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(255,92,168,0.20)] disabled:cursor-wait disabled:opacity-60"
        >
          {submitting ? copy.creatingCharacter : copy.createCharacter}
        </button>
      </form>
    </div>
  );
}
