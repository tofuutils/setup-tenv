const pkg = require('../releases');

describe('getRelease', () => {
  function mockFetchReleases () {
    const mockReleasesMeta = [{
      tag_name: 'v3.2.3',
      assets: [{
        name: 'tenv_v3.2.3_arm64.deb',
        browser_download_url: 'https://github.com/tofuutils/tenv/releases/download/v3.2.3/tenv_v3.2.3_arm64.deb'
      }]
    }];

    return mockReleasesMeta.map(el => new pkg.Release(el));
  }

  it.each(
    [
      ['latest', '3.2.3']
    ]
  )('happy path: getRelease(\'%s\') -> \'%s\'', async (input, wantVersion) => {
    const want = mockFetchReleases().find(el => el.version === wantVersion);
    const gotRelease = await pkg.getRelease(input, '', mockFetchReleases);
    expect(gotRelease).toEqual(want);
  });

  it.each(
    [
      ['foo', 'Input version cannot be used, see semver: https://semver.org/spec/v2.0.0.html', mockFetchReleases],
      ['3.100.0', 'No matching version found', mockFetchReleases],
      ['latest', 'No tenv releases found, please contact tofuutils', async () => { return null; }],
      ['latest', 'No tenv releases found, please contact tofuutils', async () => { return []; }]
    ]
  )('unhappy path: getRelease(\'%s\') -> throw Error(\'%s\')', async (input, wantErrorMessage, mockFetchReleasesFn) => {
    try {
      await pkg.getRelease(input, '', mockFetchReleasesFn);
      expect(true).toBe(false);
    } catch (e) {
      expect(e.message).toBe(wantErrorMessage);
    }
  });
});
