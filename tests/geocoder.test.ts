import { afterEach, describe, expect, it, vi } from 'vitest';
import { geocodeAustralianAddress } from '../server/geocoder';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEOCODER_SEARCH_URL;
});

describe('Australian address geocoder', () => {
  it('rejects an empty address without making a network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(geocodeAustralianAddress('   ')).rejects.toThrow(/Enter a street/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('limits a user-triggered lookup to Australia and sanitises candidates', async () => {
    process.env.GEOCODER_SEARCH_URL = 'https://geocoder.example/search';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      {
        display_name: 'One William Street, Brisbane, Queensland, 4000, Australia',
        lat: '-27.4721',
        lon: '153.0252',
        boundingbox: ['-27.4722', '-27.4720', '153.0251', '153.0253'],
      },
      { display_name: 'Broken result', lat: 'not-a-number', lon: '153' },
    ]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const candidates = await geocodeAustralianAddress('1 William Street, Brisbane QLD 4000');

    expect(candidates).toEqual([{
      label: 'One William Street, Brisbane, Queensland, 4000, Australia',
      latitude: -27.4721,
      longitude: 153.0252,
      boundingBox: [-27.4722, -27.472, 153.0251, 153.0253],
    }]);
    const [requestUrl, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(requestUrl.searchParams.get('countrycodes')).toBe('au');
    expect(requestUrl.searchParams.get('limit')).toBe('5');
    expect(options.headers).toMatchObject({ 'accept-language': 'en-AU,en;q=0.8' });
  });
});
