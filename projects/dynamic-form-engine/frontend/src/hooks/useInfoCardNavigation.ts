// Pure state hook for Info-Card screen navigation.
// No side effects — only computes derived state from the current screen index.

import { useCallback, useState } from 'react';

export interface InfoCardNavigationState {
  currentIndex: number;
  isFirstScreen: boolean;
  isLastScreen: boolean;
  goNext: () => void;
  goPrev: () => void;
  skipAll: () => void;
}

export function useInfoCardNavigation(
  screenCount: number,
  onComplete: () => void,
): InfoCardNavigationState {
  const [currentIndex, setCurrentIndex] = useState(0);

  const isFirstScreen = currentIndex === 0;
  const isLastScreen = currentIndex === screenCount - 1;

  const goNext = useCallback(() => {
    if (currentIndex < screenCount - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      onComplete();
    }
  }, [currentIndex, screenCount, onComplete]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  const skipAll = useCallback(() => {
    onComplete();
  }, [onComplete]);

  return { currentIndex, isFirstScreen, isLastScreen, goNext, goPrev, skipAll };
}
