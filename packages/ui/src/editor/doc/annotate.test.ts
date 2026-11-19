import { describe, expect, it } from 'vitest';
import { bounds, clip, coverage, enclosed, inPolygon, selectorOf, simplify, smoothPath, summary, type Box, type Pt } from './annotate';

const square = (x: number, y: number, s: number): Pt[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
interface Node { name: string; box: Box | null; kids: Node[] }
const node = (name: string, box: Box | null, kids: Node[] = []): Node => ({ name, box, kids });
const at = (left: number, top: number, w: number, h: number): Box => ({ left, top, right: left + w, bottom: top + h });
const pick = (roots: Node[], poly: Pt[]) => enclosed(roots, (n) => n.box, (n) => n.kids, poly).map((n) => n.name);

describe('loop geometry', () => {
  it('tells inside from outside, even for a loop that crosses itself', () => {
    const sq = square(0, 0, 10);
    expect(inPolygon([5, 5], sq)).toBe(true);
    expect(inPolygon([15, 5], sq)).toBe(false);
    const bowtie: Pt[] = [[0, 0], [10, 10], [10, 0], [0, 10]];
    expect(inPolygon([2, 5], bowtie)).toBe(true);
    expect(inPolygon([5, 2], bowtie)).toBe(false);
  });
  it('measures how much of a box a loop covers', () => {
    expect(coverage(at(2, 2, 6, 6), square(0, 0, 10))).toBe(1);
    expect(coverage(at(20, 20, 6, 6), square(0, 0, 10))).toBe(0);
    expect(coverage(at(4, 0, 10, 10), square(0, 0, 10))).toBeCloseTo(0.6); // 3 of 5 sampled columns
  });
  it('simplifies a drawn loop to at most 64 rounded points that keep its shape', () => {
    const circle: Pt[] = Array.from({ length: 500 }, (_, i) => [100 + 80 * Math.cos(i / 80), 100 + 80 * Math.sin(i / 80)]);
    const out = simplify(circle);
    expect(out.length).toBeLessThanOrEqual(64);
    expect(out.length).toBeGreaterThan(8);
    expect(out.every(([x, y]) => Number.isInteger(x) && Number.isInteger(y))).toBe(true);
    expect(bounds(out)).toMatchObject({ left: 20, top: 20, right: 180, bottom: 180 });
    expect(simplify([[0, 0], [5, 0.2], [10, 0]])).toEqual([[0, 0], [10, 0]]);
  });
  it('draws a circle as a smooth closed curve through its points', () => {
    const d = smoothPath([[0, 0], [10, 0], [10, 10], [0, 10], [1, 1]], true); // the last point came back to the first
    expect(d.startsWith('M0 0 C')).toBe(true);
    expect(d.endsWith(' Z')).toBe(true);
    expect(d.match(/C/g)).toHaveLength(4); // one curve per point, wrapping round
    expect(d).toContain('C1.7 -1.7 8.3 -1.7 10 0'); // tangents from the neighbours
    expect(smoothPath([[0, 0], [10, 0], [20, 5]], false).match(/C/g)).toHaveLength(2);
    expect(smoothPath([[0, 0], [5, 5]], false)).toBe('M0 0 L5 5');
  });
});

describe('what a loop encloses', () => {
  const card = node('card', at(0, 0, 100, 100), [node('title', at(10, 10, 80, 20)), node('button', at(10, 60, 30, 20))]);
  const other = node('other', at(200, 0, 100, 100));
  it('takes an element mostly inside whole, not its descendants', () => {
    expect(pick([card, other], square(-5, -5, 110))).toEqual(['card']);
  });
  it('searches an element it only touches', () => {
    expect(pick([card, other], square(5, 55, 40))).toEqual(['button']);
    expect(pick([card, other], [[5, 5], [95, 5], [95, 35], [5, 35]])).toEqual(['title']);
  });
  it('passes through boxless wrappers (display: contents)', () => {
    expect(pick([node('wrap', null, [card])], square(-5, -5, 110))).toEqual(['card']);
  });
  it('falls back to the deepest element holding the loop when nothing is mostly inside', () => {
    expect(pick([card, other], square(12, 12, 4))).toEqual(['title']);
    expect(pick([card, other], square(500, 500, 10))).toEqual([]);
  });
});

describe('element targets', () => {
  it('builds a selector that stops at a unique id and numbers only repeated tags', () => {
    expect(selectorOf([{ tag: 'button', nth: 2 }, { tag: 'div', nth: 0 }, { tag: 'section', id: 'plans', nth: 3 }, { tag: 'body', nth: 0 }]))
      .toBe('#plans > div > button:nth-of-type(2)');
    expect(selectorOf([{ tag: 'li', nth: 3 }, { tag: 'ul', nth: 0 }, { tag: 'body', nth: 0 }])).toBe('body > ul > li:nth-of-type(3)');
    expect(selectorOf([{ tag: 'main', id: 'app', nth: 0 }])).toBe('#app');
  });
  it('quotes a mark by its targets: text, else <tag.class>', () => {
    expect(summary([{ tag: 'button', text: 'Save changes' }, { tag: 'div', classes: ['card', 'wide'] }, { tag: 'hr' }])).toBe('Save changes · <div.card> · <hr>');
    expect(clip('  a \n  b  ', 10)).toBe('a b');
    expect(clip('x'.repeat(200), 160)).toHaveLength(160);
  });
});
