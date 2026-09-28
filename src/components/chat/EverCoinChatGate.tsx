"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export function EverCoinChatGate({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (open && !element?.open) element?.showModal();
    if (!open && element?.open) element.close();
  }, [open]);
  return (
    <dialog ref={dialog} onCancel={onClose} onClose={onClose}
      aria-labelledby="evercoin-chat-title"
      className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-[2rem] border border-white/10 bg-[#171217] p-6 text-white shadow-2xl backdrop:bg-black/70 md:p-8">
      <button type="button" aria-label="Close" onClick={onClose}
        className="absolute right-3 top-3 rounded-full p-2 text-bond-muted hover:text-white">
        <X size={20} />
      </button>
      <h2 id="evercoin-chat-title" className="mb-6 mt-6 rounded-3xl border border-white/10 bg-white/[0.035] px-6 py-7 text-center text-lg text-bond-muted">
        Continue with KissCoins
      </h2>
      <Link href="/coins" onClick={onClose}
        className="block rounded-3xl border border-bond-rose px-6 py-7 text-center text-2xl font-bold shadow-[0_0_18px_#ed408b15] hover:bg-bond-rose/10">
        Continue with KissCoins
      </Link>
    </dialog>
  );
}
