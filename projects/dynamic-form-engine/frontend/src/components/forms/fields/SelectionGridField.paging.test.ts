import { describe, it, expect } from 'vitest';
import { buildPageList } from './SelectionGridField';

describe('buildPageList', () => {
  it('returns every page without ellipsis when total is small', () => {
    expect(buildPageList(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns all seven pages inline at the seven-page threshold', () => {
    expect(buildPageList(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('windows around the current page with ellipses in the middle', () => {
    expect(buildPageList(5, 10)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 10]);
  });

  it('omits the leading ellipsis when the current page is near the start', () => {
    expect(buildPageList(2, 10)).toEqual([1, 2, 3, 'ellipsis', 10]);
  });

  it('omits the trailing ellipsis when the current page is near the end', () => {
    expect(buildPageList(9, 10)).toEqual([1, 'ellipsis', 8, 9, 10]);
  });
});
