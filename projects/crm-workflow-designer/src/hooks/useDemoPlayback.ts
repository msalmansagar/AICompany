import { useCallback, useEffect, useRef, useState } from 'react';
import { buildDemoBeats } from '@/services/demoScript';

export interface DemoPlayback {
  isPlaying: boolean;
  narration: string | null;
  beatIndex: number;
  beatCount: number;
  start: () => void;
  stop: () => void;
}

/**
 * Plays the scripted demo build one beat at a time. Each beat mutates the
 * open draft through ordinary store actions, so everything it does is
 * undoable and discardable; stopping mid-way simply leaves the draft as
 * built so far.
 */
export function useDemoPlayback(): DemoPlayback {
  const [isPlaying, setIsPlaying] = useState(false);
  const [narration, setNarration] = useState<string | null>(null);
  const [beatIndex, setBeatIndex] = useState(0);
  const [beatCount, setBeatCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const stop = useCallback(() => {
    clearTimer();
    setIsPlaying(false);
    setNarration(null);
  }, []);

  const start = useCallback(() => {
    if (timerRef.current !== null) return;
    const beats = buildDemoBeats();
    setBeatCount(beats.length);
    setIsPlaying(true);

    const playBeat = (index: number): void => {
      if (index >= beats.length) {
        timerRef.current = null;
        setIsPlaying(false);
        setNarration(null);
        return;
      }
      const beat = beats[index];
      setBeatIndex(index);
      setNarration(beat.narration);
      beat.run();
      timerRef.current = setTimeout(() => playBeat(index + 1), beat.holdMs);
    };

    playBeat(0);
  }, []);

  useEffect(() => clearTimer, []);

  return { isPlaying, narration, beatIndex, beatCount, start, stop };
}
