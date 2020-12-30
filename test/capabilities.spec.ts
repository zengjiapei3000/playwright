/**
 * Copyright Microsoft Corporation. All rights reserved.
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

import os from 'os';
import url from 'url';
import { it, expect } from './fixtures';

it('Web Assembly should work', (test, { browserName, platform }) => {
  test.fail(browserName === 'webkit' && platform === 'win32');
}, async function({page, server}) {
  await page.goto(server.PREFIX + '/wasm/table2.html');
  expect(await page.evaluate('loadTable()')).toBe('42, 83');
});

it('WebSocket should work', async ({page, server}) => {
  const value = await page.evaluate(port => {
    let cb;
    const result = new Promise(f => cb = f);
    const ws = new WebSocket('ws://localhost:' + port + '/ws');
    ws.addEventListener('message', data => { ws.close(); cb(data.data); });
    ws.addEventListener('error', error => cb('Error'));
    return result;
  }, server.PORT);
  expect(value).toBe('incoming');
});

it('should respect CSP', async ({page, server}) => {
  server.setRoute('/empty.html', async (req, res) => {
    res.setHeader('Content-Security-Policy', `script-src 'unsafe-inline';`);
    res.end(`
      <script>
        window.testStatus = 'SUCCESS';
        window.testStatus = eval("'FAILED'");
      </script>`);
  });

  await page.goto(server.EMPTY_PAGE);
  expect(await page.evaluate(() => window['testStatus'])).toBe('SUCCESS');
});

it('should play video', (test, { browserName, platform }) => {
  test.fixme(browserName === 'webkit' && platform !== 'darwin');
  test.fixme(browserName === 'webkit' && platform === 'darwin' && os.release() === '20.1.0');
}, async ({page, asset, isWebKit}) => {
  // TODO: the test passes on Windows locally but fails on GitHub Action bot,
  // apparently due to a Media Pack issue in the Windows Server.
  // Also the test is very flaky on Linux WebKit.
  //
  // Safari only plays mp4 so we test WebKit with an .mp4 clip.
  const fileName = isWebKit ? 'video_mp4.html' : 'video.html';
  const absolutePath = asset(fileName);
  // Our test server doesn't support range requests required to play on Mac,
  // so we load the page using a file url.
  await page.goto(url.pathToFileURL(absolutePath).href);
  await page.$eval('video', v => v.play());
  await page.$eval('video', v => v.pause());
});

it('should support webgl', (test, {browserName, headful}) => {
  test.fixme(browserName === 'firefox' && !headful);
}, async ({page}) => {
  const hasWebGL = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl');
  });
  expect(hasWebGL).toBe(true);
});

it('should support webgl 2', (test, {browserName, headful}) => {
  test.skip(browserName === 'webkit', 'Webkit doesn\'t have webgl2 enabled yet upstream.');
  test.fixme(browserName === 'firefox' && !headful);
  test.fixme(browserName === 'chromium' && headful, 'chromium doesn\'t like webgl2 when running under xvfb');
}, async ({page}) => {
  const hasWebGL2 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  });
  expect(hasWebGL2).toBe(true);
});
