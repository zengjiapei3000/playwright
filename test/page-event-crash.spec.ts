/**
 * Copyright 2017 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { it, expect, describe } from './fixtures';
import * as os from 'os';

function crash(page, toImpl, browserName) {
  if (browserName === 'chromium')
    page.goto('chrome://crash').catch(e => {});
  else if (browserName === 'webkit')
    toImpl(page)._delegate._session.send('Page.crash', {}).catch(e => {});
  else if (browserName === 'firefox')
    toImpl(page)._delegate._session.send('Page.crash', {}).catch(e => {});
}

describe('', (suite, { browserName, platform, mode }) => {
  suite.skip(mode !== 'default' && browserName !== 'chromium');
  suite.flaky(browserName === 'firefox' && platform === 'win32');
  const isBigSur = platform === 'darwin' && parseInt(os.release(), 10) >= 20;
  suite.fixme(isBigSur && browserName === 'webkit', 'Timing out after roll');
}, () => {
  it('should emit crash event when page crashes', async ({page, browserName, toImpl}) => {
    await page.setContent(`<div>This page should crash</div>`);
    crash(page, toImpl, browserName);
    await new Promise(f => page.on('crash', f));
  });

  it('should throw on any action after page crashes', async ({page, browserName, toImpl}) => {
    await page.setContent(`<div>This page should crash</div>`);
    crash(page, toImpl, browserName);
    await page.waitForEvent('crash');
    const err = await page.evaluate(() => {}).then(() => null, e => e);
    expect(err).toBeTruthy();
    expect(err.message).toContain('crash');
  });

  it('should cancel waitForEvent when page crashes', async ({page, browserName, toImpl}) => {
    await page.setContent(`<div>This page should crash</div>`);
    const promise = page.waitForEvent('response').catch(e => e);
    crash(page, toImpl, browserName);
    const error = await promise;
    expect(error.message).toContain('Page crashed');
  });

  it('should cancel navigation when page crashes', async ({page, browserName, toImpl, server}) => {
    await page.setContent(`<div>This page should crash</div>`);
    server.setRoute('/one-style.css', () => {});
    const promise = page.goto(server.PREFIX + '/one-style.html').catch(e => e);
    await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
    crash(page, toImpl, browserName);
    const error = await promise;
    expect(error.message).toContain('Navigation failed because page crashed');
  });

  it('should be able to close context when page crashes', async ({page, browserName, toImpl}) => {
    await page.setContent(`<div>This page should crash</div>`);
    crash(page, toImpl, browserName);
    await page.waitForEvent('crash');
    await page.context().close();
  });
});
