"use client";

import { useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import {
  getSoundSnapshot,
  playConfirm,
  setSoundEnabled,
  subscribeSound,
} from "@/lib/cyber/audio";

/**
 * Header audio toggle — persists to localStorage ("cs-sound").
 * When enabled, the JARVIS welcome voice plays on the next boot sequence and
 * interface tones (boot chime, blips, reveal sweep) are audible.
 */
export function SoundToggle() {
  const enabled = useSyncExternalStore(subscribeSound, getSoundSnapshot, () => true);

  const toggle = () => {
    const next = !enabled;
    setSoundEnabled(next);
    if (next) {
      // the click that just happened unlocks the audio context
      playConfirm();
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={enabled ? "Mute interface audio" : "Unmute interface audio"}
      title={enabled ? "Voice uplink ON — click to mute" : "Voice uplink MUTED — click to enable"}
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-cyber-border bg-cyber-surface text-mid transition-colors hover:border-cyber-teal/60 hover:text-cyber-teal"
    >
      {enabled ? (
        <Volume2 className="h-4 w-4" />
      ) : (
        <VolumeX className="h-4 w-4 text-cyber-amber" />
      )}
    </button>
  );
}
