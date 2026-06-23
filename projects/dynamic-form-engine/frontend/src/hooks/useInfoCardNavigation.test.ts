// RED — failing until useInfoCardNavigation is implemented.
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInfoCardNavigation } from './useInfoCardNavigation';

describe('useInfoCardNavigation', () => {
  it('starts_atIndexZero', () => {
    const { result } = renderHook(() =>
      useInfoCardNavigation(3, vi.fn()),
    );

    expect(result.current.currentIndex).toBe(0);
    expect(result.current.isFirstScreen).toBe(true);
    expect(result.current.isLastScreen).toBe(false);
  });

  it('advances_indexOnGoNext_whenNotOnLastScreen', () => {
    const { result } = renderHook(() =>
      useInfoCardNavigation(3, vi.fn()),
    );

    act(() => result.current.goNext());

    expect(result.current.currentIndex).toBe(1);
  });

  it('calls_onComplete_onGoNext_whenOnLastScreen', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      useInfoCardNavigation(1, onComplete),
    );

    // Single screen — goNext on last screen calls onComplete.
    act(() => result.current.goNext());

    expect(onComplete).toHaveBeenCalledOnce();
    // Index does not change (state stays where it is, onComplete handles phase).
    expect(result.current.currentIndex).toBe(0);
  });

  it('decrements_indexOnGoPrev_whenNotOnFirstScreen', () => {
    const { result } = renderHook(() =>
      useInfoCardNavigation(3, vi.fn()),
    );

    act(() => result.current.goNext());
    act(() => result.current.goPrev());

    expect(result.current.currentIndex).toBe(0);
  });

  it('does_not_decrement_indexOnGoPrev_whenOnFirstScreen', () => {
    const { result } = renderHook(() =>
      useInfoCardNavigation(3, vi.fn()),
    );

    act(() => result.current.goPrev());

    expect(result.current.currentIndex).toBe(0);
  });

  it('calls_onComplete_onSkipAll', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      useInfoCardNavigation(3, onComplete),
    );

    act(() => result.current.skipAll());

    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('reports_isLastScreen_correctly_onMultipleScreens', () => {
    const { result } = renderHook(() =>
      useInfoCardNavigation(2, vi.fn()),
    );

    expect(result.current.isLastScreen).toBe(false);

    act(() => result.current.goNext());

    expect(result.current.isLastScreen).toBe(true);
  });
});
