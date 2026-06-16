import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../src/middleware/error.js';
import { sanitizeLogoSvg } from '../../src/services/logo.js';

const MONO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="currentColor" d="M0 0h10v10H0z"/></svg>';
const MULTI =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#000000"/><rect x="2" y="2" width="6" height="6" fill="#ffffff"/></svg>';

describe('sanitizeLogoSvg', () => {
  it('keeps a clean monochrome svg and reports no extra colors', () => {
    const r = sanitizeLogoSvg(MONO);
    expect(r.svg).toContain('<svg');
    expect(r.svg).toContain('path');
    expect(r.multiColor).toBe(false);
    expect(r.detectedColors).toEqual([]); // currentColor is trivial, not counted
  });

  it('flags multi-color logos', () => {
    const r = sanitizeLogoSvg(MULTI);
    expect(r.multiColor).toBe(true);
    expect(r.detectedColors).toEqual(expect.arrayContaining(['#000000', '#ffffff']));
  });

  it('strips <script> and reports it', () => {
    const r = sanitizeLogoSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M0 0"/></svg>',
    );
    expect(r.svg).not.toContain('<script');
    expect(r.svg).not.toContain('alert');
    expect(r.strippedTags).toContain('script');
  });

  it('strips on* event handlers', () => {
    const r = sanitizeLogoSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" onclick="alert(1)"/></svg>',
    );
    expect(r.svg).not.toContain('onclick');
    expect(r.svg).not.toContain('alert');
  });

  it('strips <foreignObject>', () => {
    const r = sanitizeLogoSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div onclick="x()">hi</div></foreignObject><path d="M0 0"/></svg>',
    );
    expect(r.svg.toLowerCase()).not.toContain('foreignobject');
  });

  it('rejects empty input', () => {
    expect(() => sanitizeLogoSvg('   ')).toThrow(ValidationError);
  });

  it('rejects non-svg input', () => {
    expect(() => sanitizeLogoSvg('<div>not an svg</div>')).toThrow(ValidationError);
  });

  it('rejects oversize input', () => {
    const huge =
      '<svg xmlns="http://www.w3.org/2000/svg">' + '<path d="M0 0"/>'.repeat(10000) + '</svg>';
    expect(() => sanitizeLogoSvg(huge)).toThrow(ValidationError);
  });
});
