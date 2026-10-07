import { describe, expect, it } from 'vitest';

import { authorizeUrl, bridgeUrl, domainFromUrl } from '../src/url';

describe('domainFromUrl', () => {
  it('returns host only for default ports', () => {
    expect(domainFromUrl('https://festival.engine9.ai/path')).toBe(
      'festival.engine9.ai',
    );
    expect(domainFromUrl('https://Festival.Engine9.AI')).toBe('festival.engine9.ai');
  });

  it('includes port when non-default', () => {
    expect(domainFromUrl('http://localhost:3000')).toBe('localhost:3000');
  });

  it('returns null for invalid input', () => {
    expect(domainFromUrl('not-a-url')).toBeNull();
  });
});

describe('authorizeUrl', () => {
  it('uses domain query param', () => {
    const url = authorizeUrl({
      delegateUrl: 'https://delegate.engine9.ai',
      domain: 'site.example',
      returnTo: 'https://site.example/callback',
    });
    expect(url).toContain('domain=site.example');
    expect(url).not.toContain('site=');
  });

  it('sends login_level only when asked', () => {
    const base = {
      delegateUrl: 'https://delegate.engine9.ai',
      domain: 'site.example',
      returnTo: 'https://site.example/callback',
    };
    expect(new URL(authorizeUrl(base)).searchParams.has('login_level')).toBe(false);
    expect(new URL(authorizeUrl({ ...base, loginLevel: 2 })).searchParams.get('login_level')).toBe('2');
    expect(new URL(bridgeUrl({ ...base, loginLevel: 2 })).searchParams.get('login_level')).toBe('2');
  });

  it('sends expires_in only when asked', () => {
    const base = {
      delegateUrl: 'https://delegate.engine9.ai',
      domain: 'site.example',
      returnTo: 'https://site.example/callback',
    };
    expect(new URL(authorizeUrl(base)).searchParams.has('expires_in')).toBe(false);
    expect(new URL(authorizeUrl({ ...base, expiresIn: 86400 })).searchParams.get('expires_in')).toBe(
      '86400',
    );
    expect(new URL(bridgeUrl({ ...base, expiresIn: 86400 })).searchParams.get('expires_in')).toBe(
      '86400',
    );
  });
});
