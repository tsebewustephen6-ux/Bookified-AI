import Link from "next/link";
import { ArrowRight, Headphones } from "lucide-react";
import Image from "next/image";
import {
  ReadingIcon,
  ListeningIcon,
  DiscoveryIcon,
} from "@/components/premium-icons";
import { currentOwner } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { headers } from "next/headers";

import { MobileOnboarding } from "@/components/mobile-onboarding";

export default async function Home() {
  const owner = await currentOwner();
  const headersList = headers();
  const userAgent = headersList.get("user-agent") || "";
  const isNative = userAgent.includes("BookifiedMobileApp");

  if (owner) {
    redirect("/library");
  }

  if (isNative) {
    return <MobileOnboarding />;
  }

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span />A NEW CHAPTER IN READING
          </p>
          <h1>
            Your books.
            <br />A voice.
            <br />
            <em>A conversation.</em>
          </h1>
          <p className="hero-description">
            Go beyond the last page. Turn the books you love into thoughtful
            conversations, grounded in their words.
          </p>
          <Button asChild>
            <Link href="/sign-in">
              Start your story
              <ArrowRight size={18} />
            </Link>
          </Button>
          <div className="hero-note">
            <Headphones size={16} aria-hidden />
            Upload a book. Choose a voice. Talk to its contents.
          </div>
        </div>
        <div className="hero-art" aria-hidden>
          <div className="art-orbit" />
          <div className="art-label">
            A whole new way
            <br />
            to get lost in a book.
          </div>
          <div className="art-book book-back">
            <span>
              THE ART OF
              <br />
              CURIOSITY
            </span>
          </div>
          <div className="art-book book-front">
            <div className="art-book-top">THE READER’S COMPANION</div>
            <Image
              className="art-brand-symbol"
              src="/brand/bookified-mark.png"
              width={60}
              height={60}
              alt=""
              unoptimized
            />
            <strong>
              Between
              <br />
              <em>the lines.</em>
            </strong>
            <div className="book-bottom">THERE’S MORE TO THE STORY</div>
          </div>
          <div className="voice-bubble">
            <span className="sound-bars">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <span>Let’s talk about it.</span>
          </div>
          <span className="art-star">✧</span>
        </div>
      </section>
      <section className="library-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">YOUR PERSONAL BOOKSHELF</p>
            <h2>
              Good stories deserve a conversation.
            </h2>
          </div>
        </div>
        <div className="intro-grid">
          {[
            {
              icon: ReadingIcon,
              n: "01",
              title: "Bring your book",
              text: "Add a readable PDF to your private library.",
            },
            {
              icon: ListeningIcon,
              n: "02",
              title: "Find your voice",
              text: "Choose a companion that feels right for you.",
            },
            {
              icon: DiscoveryIcon,
              n: "03",
              title: "Follow your curiosity",
              text: "Ask, explore, and return to the passages behind every answer.",
            },
          ].map((item) => (
            <article key={item.n}>
              <span className="step-number">{item.n}</span>
              <span className="premium-icon">
                <item.icon />
              </span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
