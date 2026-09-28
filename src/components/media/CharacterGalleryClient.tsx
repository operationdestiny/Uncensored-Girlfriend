"use client";

import Link from "next/link";
import {
  Check,
  Clapperboard,
  ImageIcon,
  LoaderCircle,
  LockKeyhole,
  Trash2
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { InsufficientEverCoinModal } from "@/components/media/InsufficientEverCoinModal";
import { MEDIA_GALLERY_COPY } from "@/lib/media-gallery-language";
import { useSiteLanguage } from "@/lib/site-language";
import { localizedErrorMessage } from "@/lib/final-localization-language";

type GalleryCharacter = {
  id: string;
  slug: string;
  name: string;
  image: string;
};

type GalleryImage = {
  id: string;
  url: string;
  prompt: string;
  createdAt: string;
};

type GalleryVideo = {
  id: string;
  url: string;
  prompt: string;
  durationSeconds: number;
  createdAt: string;
};

type ImageGalleryData = {
  character: GalleryCharacter;
  images: GalleryImage[];
  selectedImageId: string | null;
  limit: number;
  imageCost: number;
};

type VideoGalleryData = {
  character: GalleryCharacter;
  videos: GalleryVideo[];
  limit: number;
  videoCost: number;
  pricingConfigured: boolean;
  pendingRequestId: string | null;
  durationOptions: number[];
};

const IMAGE_PROMPT_MAX_CHARACTERS = 600;
const VIDEO_PROMPT_MAX_CHARACTERS = 1_000;
const VIDEO_POLL_DELAY_MS = 6_000;

export function CharacterGalleryClient({ slug }: { slug: string }) {
  const { language } = useSiteLanguage();
  const copy = MEDIA_GALLERY_COPY[language] ?? MEDIA_GALLERY_COPY.EN;
  const { session, authReady, openAuthModal } = useAuth();

  const [imageData, setImageData] = useState<ImageGalleryData | null>(null);
  const [videoData, setVideoData] = useState<VideoGalleryData | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [videoPrompt, setVideoPrompt] = useState("");
  const [videoDuration, setVideoDuration] = useState(8);
  const [loading, setLoading] = useState(true);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [pendingImageCard, setPendingImageCard] = useState(false);
  const [pendingVideoRequestId, setPendingVideoRequestId] = useState<string | null>(null);
  const [submittingVideo, setSubmittingVideo] = useState(false);
  const [busyImageId, setBusyImageId] = useState<string | null>(null);
  const [busyVideoId, setBusyVideoId] = useState<string | null>(null);
  const [imageError, setImageError] = useState("");
  const [videoError, setVideoError] = useState("");
  const [coinModal, setCoinModal] = useState(false);

  const character = imageData?.character ?? videoData?.character ?? null;
  const imageAtLimit = Boolean(
    imageData && imageData.images.length >= imageData.limit
  );
  const videoAtLimit = Boolean(
    videoData && videoData.videos.length >= videoData.limit
  );
  const videoBusy = Boolean(pendingVideoRequestId || submittingVideo);

  const canGenerateImage =
    Boolean(imageData) &&
    !imageAtLimit &&
    imagePrompt.trim().length >= 3 &&
    !generatingImage;

  const canGenerateVideo =
    Boolean(videoData?.pricingConfigured) &&
    !videoAtLimit &&
    videoPrompt.trim().length >= 3 &&
    !videoBusy;

  async function loadGalleries() {
    if (!session?.access_token) return;

    setLoading(true);
    setImageError("");
    setVideoError("");

    try {
      const authorization = {
        Authorization: `Bearer ${session.access_token}`
      };
      const [imageResponse, videoResponse] = await Promise.all([
        fetch(`/api/character-gallery/${encodeURIComponent(slug)}`, {
          headers: authorization,
          cache: "no-store"
        }),
        fetch(`/api/character-video-gallery/${encodeURIComponent(slug)}`, {
          headers: authorization,
          cache: "no-store"
        })
      ]);

      const [imagePayload, videoPayload] = await Promise.all([
        imageResponse.json().catch(() => ({})),
        videoResponse.json().catch(() => ({}))
      ]);

      if (!imageResponse.ok) {
        throw new Error(
          localizedErrorMessage(
            imagePayload?.message ?? imagePayload?.error,
            language,
            copy.mediaError,
            "media"
          )
        );
      }
      if (!videoResponse.ok) {
        throw new Error(
          localizedErrorMessage(
            videoPayload?.message ?? videoPayload?.error,
            language,
            copy.mediaError,
            "media"
          )
        );
      }

      const nextImages = imagePayload as ImageGalleryData;
      const nextVideos = videoPayload as VideoGalleryData;
      setImageData(nextImages);
      setVideoData(nextVideos);
      setPendingVideoRequestId(nextVideos.pendingRequestId);

      if (nextVideos.durationOptions?.length) {
        setVideoDuration(nextVideos.durationOptions[0]);
      }
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : copy.mediaError;
      setImageError(message);
      setVideoError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authReady) return;

    if (!session) {
      openAuthModal();
      setLoading(false);
      return;
    }

    void loadGalleries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, session?.access_token, slug]);

  useEffect(() => {
    if (!session?.access_token || !pendingVideoRequestId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const response = await fetch(
          `/api/character-video-gallery/${encodeURIComponent(slug)}?requestId=${encodeURIComponent(pendingVideoRequestId!)}`,
          {
            headers: {
              Authorization: `Bearer ${session!.access_token}`
            },
            cache: "no-store"
          }
        );
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (!response.ok) {
          throw new Error(localizedErrorMessage(
            payload?.message ?? payload?.error,
            language,
            copy.mediaError,
            "media"
          ));
        }

        if (payload?.status === "completed" && payload?.video) {
          const nextVideo = payload.video as GalleryVideo;
          setVideoData((current) =>
            current
              ? {
                  ...current,
                  videos: [
                    nextVideo,
                    ...current.videos.filter((video) => video.id !== nextVideo.id)
                  ],
                  pendingRequestId: null
                }
              : current
          );
          setVideoPrompt("");
          setPendingVideoRequestId(null);
          setVideoError("");
          return;
        }

        if (payload?.status === "failed") {
          setVideoError(localizedErrorMessage(
            payload?.message ?? payload?.error,
            language,
            copy.mediaError,
            "media"
          ));
          setPendingVideoRequestId(null);
          return;
        }

        timer = setTimeout(() => void poll(), VIDEO_POLL_DELAY_MS);
      } catch (pollError) {
        if (cancelled) return;
        setVideoError(
          pollError instanceof Error ? pollError.message : copy.mediaError
        );
        timer = setTimeout(() => void poll(), VIDEO_POLL_DELAY_MS * 2);
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [copy.mediaError, pendingVideoRequestId, session?.access_token, slug]);

  async function generateImage() {
    if (!session?.access_token || !canGenerateImage) return;

    const requestId = crypto.randomUUID();
    setGeneratingImage(true);
    setPendingImageCard(true);
    setImageError("");

    try {
      const response = await fetch(
        `/api/character-gallery/${encodeURIComponent(slug)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            requestId,
            prompt: imagePrompt.trim()
          })
        }
      );
      const payload = await response.json().catch(() => ({}));

      if (
        response.status === 402 ||
        payload?.error === "INSUFFICIENT_EVERCOIN" ||
        payload?.error === "EVERCOIN_DEBT"
      ) {
        setCoinModal(true);
        return;
      }
      if (payload?.error === "IMAGE_LIMIT_REACHED") {
        setImageError(copy.imageLimitReached);
        return;
      }
      if (payload?.error === "IMAGE_REQUEST_IN_PROGRESS") {
        setImageError(copy.imageRequestBusy);
        return;
      }
      if (!response.ok || !payload?.image) {
        throw new Error(localizedErrorMessage(
            payload?.message ?? payload?.error,
            language,
            copy.mediaError,
            "media"
          ));
      }

      const nextImage = payload.image as GalleryImage;
      setImageData((current) =>
        current
          ? {
              ...current,
              images: [
                nextImage,
                ...current.images.filter((image) => image.id !== nextImage.id)
              ]
            }
          : current
      );
      setImagePrompt("");
    } catch (generateError) {
      setImageError(
        generateError instanceof Error ? generateError.message : copy.mediaError
      );
    } finally {
      setGeneratingImage(false);
      setPendingImageCard(false);
    }
  }

  async function generateVideo() {
    if (!session?.access_token || !canGenerateVideo) return;

    const requestId = crypto.randomUUID();
    setSubmittingVideo(true);
    setVideoError("");

    try {
      const response = await fetch(
        `/api/character-video-gallery/${encodeURIComponent(slug)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            requestId,
            prompt: videoPrompt.trim(),
            durationSeconds: videoDuration
          })
        }
      );
      const payload = await response.json().catch(() => ({}));

      if (
        response.status === 402 ||
        payload?.error === "INSUFFICIENT_EVERCOIN" ||
        payload?.error === "EVERCOIN_DEBT"
      ) {
        setCoinModal(true);
        return;
      }
      if (payload?.error === "VIDEO_LIMIT_REACHED") {
        setVideoError(copy.videoLimitReached);
        return;
      }
      if (payload?.error === "VIDEO_REQUEST_IN_PROGRESS") {
        setVideoError(copy.videoRequestBusy);
        return;
      }
      if (payload?.error === "VIDEO_PRICING_NOT_CONFIGURED") {
        setVideoError(copy.pricingPendingBody);
        return;
      }
      if (!response.ok) {
        throw new Error(localizedErrorMessage(
            payload?.message ?? payload?.error,
            language,
            copy.mediaError,
            "media"
          ));
      }

      if (payload?.status === "completed" && payload?.video) {
        const nextVideo = payload.video as GalleryVideo;
        setVideoData((current) =>
          current
            ? {
                ...current,
                videos: [
                  nextVideo,
                  ...current.videos.filter((video) => video.id !== nextVideo.id)
                ]
              }
            : current
        );
        setVideoPrompt("");
        return;
      }

      setPendingVideoRequestId(requestId);
      setVideoData((current) =>
        current ? { ...current, pendingRequestId: requestId } : current
      );
    } catch (generateError) {
      setVideoError(
        generateError instanceof Error ? generateError.message : copy.mediaError
      );
    } finally {
      setSubmittingVideo(false);
    }
  }

  async function actOnImage(
    action: "select" | "deselect" | "delete",
    imageId: string
  ) {
    if (!session?.access_token || busyImageId) return;

    setBusyImageId(imageId);
    setImageError("");

    try {
      const response = await fetch(
        `/api/character-gallery/${encodeURIComponent(slug)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ action, imageId })
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(localizedErrorMessage(
            payload?.message ?? payload?.error,
            language,
            copy.mediaError,
            "media"
          ));
      }

      if (action === "select") {
        setImageData((current) =>
          current ? { ...current, selectedImageId: imageId } : current
        );
        window.dispatchEvent(
          new CustomEvent("everbond:chat-image-changed", {
            detail: { characterSlug: slug, imageId }
          })
        );
        return;
      }

      if (action === "deselect") {
        setImageData((current) =>
          current ? { ...current, selectedImageId: null } : current
        );
        window.dispatchEvent(
          new CustomEvent("everbond:chat-image-changed", {
            detail: { characterSlug: slug, imageId: null }
          })
        );
        return;
      }

      const deletedWasSelected = imageData?.selectedImageId === imageId;
      setImageData((current) =>
        current
          ? {
              ...current,
              images: current.images.filter((image) => image.id !== imageId),
              selectedImageId: deletedWasSelected
                ? null
                : current.selectedImageId
            }
          : current
      );

      if (deletedWasSelected) {
        window.dispatchEvent(
          new CustomEvent("everbond:chat-image-changed", {
            detail: { characterSlug: slug, imageId: null }
          })
        );
      }
    } catch (actionError) {
      setImageError(
        actionError instanceof Error ? actionError.message : copy.mediaError
      );
    } finally {
      setBusyImageId(null);
    }
  }

  async function deleteVideo(videoId: string) {
    if (!session?.access_token || busyVideoId) return;

    setBusyVideoId(videoId);
    setVideoError("");

    try {
      const response = await fetch(
        `/api/character-video-gallery/${encodeURIComponent(slug)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ action: "delete", videoId })
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(localizedErrorMessage(
            payload?.message ?? payload?.error,
            language,
            copy.mediaError,
            "media"
          ));
      }

      setVideoData((current) =>
        current
          ? {
              ...current,
              videos: current.videos.filter((video) => video.id !== videoId)
            }
          : current
      );
    } catch (actionError) {
      setVideoError(
        actionError instanceof Error ? actionError.message : copy.mediaError
      );
    } finally {
      setBusyVideoId(null);
    }
  }

  if (!authReady || loading) {
    return (
      <main className="min-h-screen px-4 py-12">
        <div className="bond-container">
          <div className="mx-auto max-w-6xl rounded-[2rem] border border-bond-rose/35 bg-white/[0.03] p-12 text-center">
            <LoaderCircle className="mx-auto animate-spin text-bond-rose" />
          </div>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen px-4 py-12">
        <div className="bond-container">
          <div className="mx-auto max-w-3xl rounded-[2rem] border border-bond-rose/35 bg-white/[0.03] p-10 text-center text-bond-muted">
            {copy.subtitle}
          </div>
        </div>
      </main>
    );
  }

  if (!imageData || !videoData || !character) {
    return (
      <main className="min-h-screen px-4 py-12">
        <div className="bond-container">
          <div className="mx-auto max-w-3xl rounded-[2rem] border border-red-400/25 bg-red-500/10 p-10 text-center text-red-100">
            {imageError || videoError || copy.mediaError}
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-screen px-4 py-10 md:px-6">
        <div className="bond-container">
          <div className="mx-auto max-w-[1500px]">
            <section className="overflow-hidden rounded-[2.25rem] border border-bond-rose/45 bg-[linear-gradient(135deg,rgba(255,92,168,0.12),rgba(255,255,255,0.025),rgba(89,45,130,0.14))] p-7 shadow-[0_0_48px_rgba(255,92,168,0.10)] md:p-10">
              <div className="grid gap-8 lg:grid-cols-[230px_1fr] lg:items-center">
                <img
                  src={character.image}
                  alt={character.name}
                  className="aspect-[4/5] w-full rounded-[1.75rem] border border-bond-rose/35 object-cover shadow-[0_0_35px_rgba(255,92,168,0.12)]"
                />
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.24em] text-bond-rose">
                    <LockKeyhole size={16} />
                    {copy.privateOnly}
                  </p>
                  <h1 className="mt-3 font-display text-4xl font-bold text-white md:text-6xl">
                    {copy.title(character.name)}
                  </h1>
                  <p className="mt-4 max-w-4xl text-lg leading-8 text-bond-muted">
                    {copy.subtitle}
                  </p>
                  <Link
                    href={`/chat/${character.slug}`}
                    className="mt-6 inline-flex rounded-full border border-bond-rose/55 bg-black/25 px-6 py-3 text-sm font-bold text-white hover:bg-bond-rose/10"
                  >
                    {copy.backToChat}
                  </Link>
                </div>
              </div>
            </section>

            <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:items-start">
              <section className="rounded-[2.25rem] border border-bond-rose/35 bg-white/[0.025] p-6 md:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-bond-rose">
                      <ImageIcon size={17} />
                      {copy.imageStudio}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-white/75">
                      {imageData.images.length} / {imageData.limit} · {copy.images}
                    </p>
                  </div>
                </div>

                <textarea
                  value={imagePrompt}
                  onChange={(event) =>
                    setImagePrompt(
                      event.target.value.slice(0, IMAGE_PROMPT_MAX_CHARACTERS)
                    )
                  }
                  placeholder={copy.describeImage}
                  rows={5}
                  maxLength={IMAGE_PROMPT_MAX_CHARACTERS}
                  className="mt-5 w-full resize-none rounded-[1.5rem] border border-white/10 bg-black/25 px-5 py-4 text-white outline-none placeholder:text-bond-muted focus:border-bond-rose/65"
                />
                <p className="mt-2 text-right text-xs font-semibold text-white/45">
                  {imagePrompt.length} / {IMAGE_PROMPT_MAX_CHARACTERS}
                </p>

                {imageAtLimit && (
                  <p className="mt-3 text-sm font-semibold text-bond-gold">
                    {copy.imageLimitReached}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => void generateImage()}
                  disabled={!canGenerateImage}
                  className="bond-pink-button mt-4 inline-flex items-center gap-2 rounded-full bg-bond-rose px-6 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {generatingImage ? (
                    <LoaderCircle size={17} className="animate-spin" />
                  ) : (
                    <ImageIcon size={17} />
                  )}
                  {generatingImage
                    ? copy.generatingImage
                    : `${copy.generateImage} · ${imageData.imageCost} EverCoin`}
                </button>

                {imageError && (
                  <p className="mt-4 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {imageError}
                  </p>
                )}

                <div className="mt-7 grid gap-5 sm:grid-cols-2">
                  {pendingImageCard && (
                    <article className="aspect-[4/5] animate-pulse rounded-[1.75rem] border border-bond-rose/40 bg-[radial-gradient(circle_at_center,rgba(255,92,168,0.18),rgba(255,255,255,0.03))]">
                      <div className="flex h-full items-center justify-center">
                        <LoaderCircle className="animate-spin text-bond-rose" size={34} />
                      </div>
                    </article>
                  )}

                  {imageData.images.length === 0 && !pendingImageCard ? (
                    <div className="sm:col-span-2 rounded-[1.75rem] border border-dashed border-white/10 bg-white/[0.02] p-10 text-center text-bond-muted">
                      {copy.imageEmpty}
                    </div>
                  ) : null}

                  {imageData.images.map((image) => {
                    const selected = imageData.selectedImageId === image.id;
                    const busy = busyImageId === image.id;
                    return (
                      <article
                        key={image.id}
                        className={`overflow-hidden rounded-[1.75rem] border bg-black/25 ${
                          selected
                            ? "border-bond-gold shadow-[0_0_30px_rgba(246,196,83,0.18)]"
                            : "border-white/10"
                        }`}
                      >
                        <div className="aspect-[4/5] overflow-hidden bg-black">
                          <img src={image.url} alt="" className="h-full w-full object-cover" />
                        </div>
                        <div className="p-4">
                          <p className="line-clamp-2 min-h-[2.7rem] text-sm leading-6 text-bond-muted">
                            {image.prompt}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              void actOnImage(
                                selected ? "deselect" : "select",
                                image.id
                              )
                            }
                            disabled={Boolean(busyImageId)}
                            className={`mt-4 flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 ${
                              selected
                                ? "bg-bond-gold/15 text-bond-gold"
                                : "bg-bond-rose text-white"
                            }`}
                          >
                            {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />}
                            {selected ? copy.useDefaultImage : copy.setChatImage}
                          </button>
                          <button
                            type="button"
                            onClick={() => void actOnImage("delete", image.id)}
                            disabled={Boolean(busyImageId)}
                            className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-red-400/25 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Trash2 size={16} />}
                            {copy.deleteImage}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[2.25rem] border border-bond-violet/45 bg-white/[0.025] p-6 md:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-bond-rose">
                      <Clapperboard size={17} />
                      {copy.videoStudio}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-white/75">
                      {videoData.videos.length} / {videoData.limit} · {copy.videos}
                    </p>
                  </div>
                </div>

                <textarea
                  value={videoPrompt}
                  onChange={(event) =>
                    setVideoPrompt(
                      event.target.value.slice(0, VIDEO_PROMPT_MAX_CHARACTERS)
                    )
                  }
                  placeholder={copy.describeVideo}
                  rows={5}
                  maxLength={VIDEO_PROMPT_MAX_CHARACTERS}
                  className="mt-5 w-full resize-none rounded-[1.5rem] border border-white/10 bg-black/25 px-5 py-4 text-white outline-none placeholder:text-bond-muted focus:border-bond-rose/65"
                />
                <p className="mt-2 text-right text-xs font-semibold text-white/45">
                  {videoPrompt.length} / {VIDEO_PROMPT_MAX_CHARACTERS}
                </p>

                {!videoData.pricingConfigured && (
                  <p className="mt-4 rounded-xl border border-bond-gold/25 bg-bond-gold/10 px-4 py-3 text-sm font-semibold text-bond-gold">
                    {copy.pricingPendingBody}
                  </p>
                )}
                {videoAtLimit && (
                  <p className="mt-3 text-sm font-semibold text-bond-gold">
                    {copy.videoLimitReached}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => void generateVideo()}
                  disabled={!canGenerateVideo}
                  className="bond-pink-button mt-4 inline-flex items-center gap-2 rounded-full bg-bond-rose px-6 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {videoBusy ? (
                    <LoaderCircle size={17} className="animate-spin" />
                  ) : (
                    <Clapperboard size={17} />
                  )}
                  {videoBusy
                    ? copy.creatingVideo
                    : videoData.pricingConfigured
                      ? `${copy.generateVideo} · ${videoData.videoCost} EverCoin`
                      : copy.pricingPending}
                </button>

                {videoError && (
                  <p className="mt-4 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {videoError}
                  </p>
                )}

                <div className="mt-7 grid gap-5 sm:grid-cols-2">
                  {pendingVideoRequestId && (
                    <article className="aspect-[9/16] animate-pulse rounded-[1.75rem] border border-bond-violet/45 bg-[radial-gradient(circle_at_center,rgba(136,78,255,0.20),rgba(255,255,255,0.03))] p-5">
                      <div className="flex h-full flex-col items-center justify-center text-center">
                        <LoaderCircle className="animate-spin text-bond-rose" size={34} />
                        <p className="mt-4 text-sm font-semibold leading-6 text-bond-muted">
                          {copy.videoQueued}
                        </p>
                      </div>
                    </article>
                  )}

                  {videoData.videos.length === 0 && !pendingVideoRequestId ? (
                    <div className="sm:col-span-2 rounded-[1.75rem] border border-dashed border-white/10 bg-white/[0.02] p-10 text-center text-bond-muted">
                      {copy.videoEmpty}
                    </div>
                  ) : null}

                  {videoData.videos.map((video) => {
                    const busy = busyVideoId === video.id;
                    return (
                      <article
                        key={video.id}
                        className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-black/25"
                      >
                        <div className="aspect-[9/16] overflow-hidden bg-black">
                          <video
                            src={video.url}
                            controls
                            playsInline
                            preload="metadata"
                            className="h-full w-full object-contain"
                          />
                        </div>
                        <div className="p-4">
                          <p className="line-clamp-2 min-h-[2.7rem] text-sm leading-6 text-bond-muted">
                            {video.prompt}
                          </p>
                          <p className="mt-2 text-xs font-bold text-white/55">
                            {video.durationSeconds} {copy.seconds}
                          </p>
                          <button
                            type="button"
                            onClick={() => void deleteVideo(video.id)}
                            disabled={Boolean(busyVideoId)}
                            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-red-400/25 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Trash2 size={16} />}
                            {copy.deleteVideo}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      <InsufficientEverCoinModal
        open={coinModal}
        onClose={() => setCoinModal(false)}
      />
    </>
  );
}
