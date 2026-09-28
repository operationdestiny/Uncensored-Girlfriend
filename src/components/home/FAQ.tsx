const faqs = [
  {
    q: "Are chats private?",
    a: "EverBond AI is built around 100% private chats. Your personal conversations are not public companion pages or social posts."
  },
  {
    q: "What is Ever Memory™?",
    a: "Ever Memory™ helps companions remember story progress, important facts, promises, and relationship state so conversations can continue where they left off."
  },
  {
    q: "Do I need to sign up to start chatting?",
    a: "No. You can start chatting instantly. Your first 20 successful messages are free; after that, 3 EC unlocks 19 messages."
  },
  {
    q: "Can I reset a conversation?",
    a: "Yes. Reset conversation is included in the chat interface so you can start fresh whenever you want."
  },
  {
    q: "Are public companions moderated?",
    a: "Public companions use automatic scan and report flow. Public displayed content should stay safe and appropriate."
  },
  {
    q: "Can I use other languages?",
    a: "English is the default, with options for Spanish, French, Japanese, German, and Korean. Companions should respond in the same language you use."
  }
];

export function FAQ() {
  return (
    <section className="py-16">
      <div className="bond-container">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-bond-rose">FAQ</p>
          <h2 className="font-display text-4xl font-bold tracking-tight md:text-5xl">Questions before you start?</h2>
        </div>
        <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
          {faqs.map((faq) => (
            <div key={faq.q} className="bond-card rounded-[2rem] p-5">
              <h3 className="font-display text-lg font-bold">{faq.q}</h3>
              <p className="mt-3 text-sm leading-6 text-bond-muted">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
