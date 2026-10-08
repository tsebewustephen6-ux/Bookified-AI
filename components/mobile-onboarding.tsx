"use client";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export function MobileOnboarding() {
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  if (!isNative) return null;

  return (
    <div className="fixed inset-0 flex flex-col bg-[#FDFBF7] text-[#2A2626] overflow-hidden z-[9999]">
      <div className="flex-1 flex flex-col justify-center items-center relative p-8">
        <Image
          src="/brand/bookified-mark.png"
          width={120}
          height={120}
          alt="Bookified Logo"
          unoptimized
          className="drop-shadow-xl z-10"
        />
        <h1 className="text-4xl font-serif text-center mt-8 font-bold leading-tight z-10">
          Your books.<br/>A voice.<br/><em className="font-light italic text-[#6B5A4E]">A conversation.</em>
        </h1>
      </div>

      <div className="bg-white px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-20 flex flex-col gap-6">
        <div className="text-center">
          <p className="text-sm font-medium tracking-widest text-[#8A7969] uppercase mb-2">
            The Reader's Companion
          </p>
          <p className="text-base text-gray-600 leading-relaxed max-w-sm mx-auto">
            Go beyond the last page. Turn the books you love into thoughtful conversations.
          </p>
        </div>

        <Button asChild className="w-full h-14 text-lg rounded-full bg-[#2A2626] text-white hover:bg-[#4A4545] shadow-lg mt-2">
          <Link href="/sign-in" className="flex items-center justify-center gap-2">
            Start your story
            <ArrowRight size={20} />
          </Link>
        </Button>
      </div>
    </div>
  );
}
