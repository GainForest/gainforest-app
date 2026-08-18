const managedAudio = new Set<HTMLAudioElement>();

export function registerAudioElement(el: HTMLAudioElement): () => void {
  managedAudio.add(el);
  return () => {
    managedAudio.delete(el);
  };
}

export function pauseOtherAudio(current?: HTMLMediaElement | null) {
  for (const el of managedAudio) {
    if (el !== current && !el.paused) el.pause();
  }

  if (typeof document === "undefined") return;
  for (const el of document.querySelectorAll("audio")) {
    if (el !== current && !el.paused) el.pause();
  }
}

export function playExclusiveAudio(el: HTMLAudioElement): Promise<void> {
  pauseOtherAudio(el);
  return el.play();
}
