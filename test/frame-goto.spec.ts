/**
 * Copyright 2018 Google Inc. All rights reserved.
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

import { it, expect } from './fixtures';
import { attachFrame } from './utils';

it('should navigate subframes', async ({page, server}) => {
  await page.goto(server.PREFIX + '/frames/one-frame.html');
  expect(page.frames()[0].url()).toContain('/frames/one-frame.html');
  expect(page.frames()[1].url()).toContain('/frames/frame.html');

  const response = await page.frames()[1].goto(server.EMPTY_PAGE);
  expect(response.ok()).toBe(true);
  expect(response.frame()).toBe(page.frames()[1]);
});

it('should reject when frame detaches', async ({page, server}) => {
  await page.goto(server.PREFIX + '/frames/one-frame.html');

  server.setRoute('/empty.html', () => {});
  const navigationPromise = page.frames()[1].goto(server.EMPTY_PAGE).catch(e => e);
  await server.waitForRequest('/empty.html');

  await page.$eval('iframe', frame => frame.remove());
  const error = await navigationPromise;
  expect(error.message).toContain('frame was detached');
});

it('should continue after client redirect', async ({page, server}) => {
  server.setRoute('/frames/script.js', () => {});
  const url = server.PREFIX + '/frames/child-redirect.html';
  const error = await page.goto(url, { timeout: 5000, waitUntil: 'networkidle' }).catch(e => e);
  expect(error.message).toContain('page.goto: Timeout 5000ms exceeded.');
  expect(error.message).toContain(`navigating to "${url}", waiting until "networkidle"`);
});

it('should return matching responses', async ({page, server}) => {
  await page.goto(server.EMPTY_PAGE);
  // Attach three frames.
  const frames = [
    await attachFrame(page, 'frame1', server.EMPTY_PAGE),
    await attachFrame(page, 'frame2', server.EMPTY_PAGE),
    await attachFrame(page, 'frame3', server.EMPTY_PAGE),
  ];
  const serverResponses = [];
  server.setRoute('/0.html', (req, res) => serverResponses.push(res));
  server.setRoute('/1.html', (req, res) => serverResponses.push(res));
  server.setRoute('/2.html', (req, res) => serverResponses.push(res));
  const navigations = [];
  for (let i = 0; i < 3; ++i) {
    navigations.push(frames[i].goto(server.PREFIX + '/' + i + '.html'));
    await server.waitForRequest('/' + i + '.html');
  }
  // Respond from server out-of-order.
  const serverResponseTexts = ['AAA', 'BBB', 'CCC'];
  for (const i of [1, 2, 0]) {
    serverResponses[i].end(serverResponseTexts[i]);
    const response = await navigations[i];
    expect(response.frame()).toBe(frames[i]);
    expect(await response.text()).toBe(serverResponseTexts[i]);
  }
});
