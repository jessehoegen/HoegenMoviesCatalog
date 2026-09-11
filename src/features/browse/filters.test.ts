import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SORT,
  defaultRegion,
  parseFilters,
  serialiseFilters,
  toDiscoverParams,
} from './filters';

const vocabulary = {
  supportedRegions: ['NL', 'US', 'GB'],
  validGenreIds: [28, 35, 99],
  validProviderIds: [8, 337],
};

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

describe('defaultRegion', () => {
  it('extracts the region from a full locale', () => {
    expect(defaultRegion('nl-NL', ['NL', 'US'])).toBe('NL');
  });

  it('falls back to US when the locale has no region part', () => {
    expect(defaultRegion('en', ['NL', 'US'])).toBe('US');
  });

  it('falls back to US when the region is unsupported', () => {
    expect(defaultRegion('en-ZZ', ['NL', 'US'])).toBe('US');
  });

  it('falls back to US when the language is undefined', () => {
    expect(defaultRegion(undefined, ['NL', 'US'])).toBe('US');
  });

  it('trusts the locale when the supported list is not yet loaded', () => {
    expect(defaultRegion('nl-NL', undefined)).toBe('NL');
  });

  it('reads the region subtag, not the script subtag, from a locale with a script tag', () => {
    expect(defaultRegion('zh-Hans-CN', undefined)).toBe('CN');
  });

  it('reads the region subtag from another script-tagged locale', () => {
    expect(defaultRegion('sr-Latn-RS', ['RS', 'US'])).toBe('RS');
  });

  it('falls back to US instead of throwing on a malformed locale', () => {
    expect(defaultRegion('not a locale', undefined)).toBe('US');
  });
});

describe('parseFilters', () => {
  it('applies defaults for an empty query string', () => {
    const filters = parseFilters(params(''), vocabulary, 'nl-NL');

    expect(filters).toEqual({
      region: 'NL',
      providers: [],
      genres: [],
      from: undefined,
      to: undefined,
      rating: undefined,
      sort: DEFAULT_SORT,
    });
  });

  it('parses a fully populated query string', () => {
    const filters = parseFilters(
      params('region=US&providers=8|337&genres=28|35&from=2010&to=2019&rating=7&sort=vote_average.desc'),
      vocabulary,
      'nl-NL',
    );

    expect(filters).toEqual({
      region: 'US',
      providers: [8, 337],
      genres: [28, 35],
      from: 2010,
      to: 2019,
      rating: 7,
      sort: 'vote_average.desc',
    });
  });

  it('drops unknown genre and provider ids', () => {
    const filters = parseFilters(params('genres=28|9999&providers=8|4242'), vocabulary, 'nl-NL');

    expect(filters.genres).toEqual([28]);
    expect(filters.providers).toEqual([8]);
  });

  it('keeps ids unvalidated while the vocabulary is still loading', () => {
    const filters = parseFilters(params('genres=28|9999'), {}, 'nl-NL');

    expect(filters.genres).toEqual([28, 9999]);
  });

  it('discards non-numeric and duplicate ids', () => {
    const filters = parseFilters(params('genres=28|abc|28|'), vocabulary, 'nl-NL');

    expect(filters.genres).toEqual([28]);
  });

  it('replaces an unknown sort value with the default', () => {
    const filters = parseFilters(params('sort=drop_tables'), vocabulary, 'nl-NL');

    expect(filters.sort).toBe(DEFAULT_SORT);
  });

  it('replaces an unsupported region with the locale default', () => {
    const filters = parseFilters(params('region=ZZ'), vocabulary, 'nl-NL');

    expect(filters.region).toBe('NL');
  });

  it('discards out-of-range years and ratings', () => {
    const filters = parseFilters(params('from=1500&to=abc&rating=99'), vocabulary, 'nl-NL');

    expect(filters.from).toBeUndefined();
    expect(filters.to).toBeUndefined();
    expect(filters.rating).toBeUndefined();
  });

  it('ignores "to" when it precedes "from"', () => {
    const filters = parseFilters(params('from=2019&to=2010'), vocabulary, 'nl-NL');

    expect(filters.from).toBe(2019);
    expect(filters.to).toBeUndefined();
  });

  it('treats an empty region param as absent while the vocabulary is still loading', () => {
    const filters = parseFilters(params('region='), {}, 'nl-NL');

    expect(filters.region).toBe('NL');
  });

  it('uppercases a lowercase region param', () => {
    const filters = parseFilters(params('region=us'), vocabulary, 'nl-NL');

    expect(filters.region).toBe('US');
  });

  it('discards a fractional year', () => {
    const filters = parseFilters(params('from=2010.5'), vocabulary, 'nl-NL');

    expect(filters.from).toBeUndefined();
  });

  it('keeps a fractional rating', () => {
    const filters = parseFilters(params('rating=7.5'), vocabulary, 'nl-NL');

    expect(filters.rating).toBe(7.5);
  });
});

describe('serialiseFilters', () => {
  it('omits defaults and empty values', () => {
    const query = serialiseFilters({
      region: 'NL',
      providers: [],
      genres: [],
      sort: DEFAULT_SORT,
    });

    expect(query.toString()).toBe('region=NL');
  });

  it('round-trips a populated filter set', () => {
    const original = {
      region: 'US',
      providers: [8, 337],
      genres: [28],
      from: 2010,
      to: 2019,
      rating: 7,
      sort: 'vote_average.desc' as const,
    };

    expect(parseFilters(serialiseFilters(original), vocabulary, 'nl-NL')).toEqual(original);
  });
});

describe('toDiscoverParams', () => {
  it('always sends region, flatrate monetization, sort, and page', () => {
    const result = toDiscoverParams(
      { region: 'NL', providers: [], genres: [], sort: DEFAULT_SORT },
      3,
    );

    expect(result).toMatchObject({
      page: 3,
      watch_region: 'NL',
      with_watch_monetization_types: 'flatrate',
      sort_by: DEFAULT_SORT,
    });
    expect(result.with_watch_providers).toBeUndefined();
    expect(result['vote_count.gte']).toBeUndefined();
  });

  it('joins providers and genres with pipes for OR semantics', () => {
    const result = toDiscoverParams(
      { region: 'NL', providers: [8, 337], genres: [28, 35], sort: DEFAULT_SORT },
      1,
    );

    expect(result.with_watch_providers).toBe('8|337');
    expect(result.with_genres).toBe('28|35');
  });

  it('expands years into full ISO dates', () => {
    const result = toDiscoverParams(
      { region: 'NL', providers: [], genres: [], from: 2010, to: 2019, sort: DEFAULT_SORT },
      1,
    );

    expect(result['primary_release_date.gte']).toBe('2010-01-01');
    expect(result['primary_release_date.lte']).toBe('2019-12-31');
  });

  it('adds the vote count floor whenever a rating filter is active', () => {
    const result = toDiscoverParams(
      { region: 'NL', providers: [], genres: [], rating: 8, sort: DEFAULT_SORT },
      1,
    );

    expect(result['vote_average.gte']).toBe(8);
    expect(result['vote_count.gte']).toBe(100);
  });
});
