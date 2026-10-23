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

  it('sends login_providers only when asked, as a comma list', () => {
    const base = {
      delegateUrl: 'https://delegate.engine9.ai',
      domain: 'site.example',
      returnTo: 'https://site.example/callback',
    };
    expect(new URL(authorizeUrl(base)).searchParams.has('login_providers')).toBe(false);
    expect(new URL(bridgeUrl(base)).searchParams.has('login_providers')).toBe(false);
    expect(
      new URL(authorizeUrl({ ...base, loginProviders: ['google', 'facebook'] })).searchParams.get(
        'login_providers',
      ),
    ).toBe('google,facebook');
    expect(
      new URL(bridgeUrl({ ...base, loginProviders: 'facebook,google' })).searchParams.get(
        'login_providers',
      ),
    ).toBe('facebook,google');
    expect(
      new URL(authorizeUrl({ ...base, loginProviders: [] })).searchParams.has('login_providers'),
    ).toBe(false);
  });

  it('sends brand_name, brand_color, and brand_logo only when set', () => {
    const base = {
      delegateUrl: 'https://delegate.engine9.ai',
      domain: 'site.example',
      returnTo: 'https://site.example/callback',
    };
    const plain = new URL(authorizeUrl(base)).searchParams;
    expect(plain.has('brand_name')).toBe(false);
    expect(plain.has('brand_color')).toBe(false);
    const brand = { name: ' The Sirens ', color: '#7c3aed', logo: 'https://site.example/logo.svg' };
    for (const href of [authorizeUrl({ ...base, brand }), bridgeUrl({ ...base, brand })]) {
      const params = new URL(href).searchParams;
      expect(params.get('brand_name')).toBe('The Sirens');
      expect(params.get('brand_color')).toBe('#7c3aed');
      expect(params.get('brand_logo')).toBe('https://site.example/logo.svg');
    }
    const nameOnly = new URL(bridgeUrl({ ...base, brand: { name: 'Sirens' } })).searchParams;
    expect(nameOnly.get('brand_name')).toBe('Sirens');
    expect(nameOnly.has('brand_logo')).toBe(false);
    expect(nameOnly.has('brand_background')).toBe(false);
    expect(nameOnly.has('brand_google')).toBe(false);
  });

  it('sends the page background, text, font, and Google button when set', () => {
    const base = {
      delegateUrl: 'https://delegate.engine9.ai',
      domain: 'site.example',
      returnTo: 'https://site.example/callback',
    };
    const brand = {
      background: '#0d0a1f',
      text: ' #f1eeff ',
      font: 'IBM Plex Sans',
      google: 'skip' as const,
    };
    for (const href of [authorizeUrl({ ...base, brand }), bridgeUrl({ ...base, brand })]) {
      const params = new URL(href).searchParams;
      expect(params.get('brand_background')).toBe('#0d0a1f');
      expect(params.get('brand_text')).toBe('#f1eeff');
      expect(params.get('brand_font')).toBe('IBM Plex Sans');
      expect(params.get('brand_google')).toBe('skip');
      expect(params.has('brand_card')).toBe(false);
    }
  });

  it('sends the card, its text, and a wordmark when set', () => {
    const base = {
      delegateUrl: 'https://delegate.engine9.ai',
      domain: 'site.example',
      returnTo: 'https://site.example/callback',
    };
    const brand = {
      wordmark: 'https://site.example/wordmark.svg',
      card: '#4a1942',
      cardText: ' #f7e9f3 ',
    };
    for (const href of [authorizeUrl({ ...base, brand }), bridgeUrl({ ...base, brand })]) {
      const params = new URL(href).searchParams;
      expect(params.get('brand_wordmark')).toBe('https://site.example/wordmark.svg');
      expect(params.get('brand_card')).toBe('#4a1942');
      expect(params.get('brand_card_text')).toBe('#f7e9f3');
    }
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
