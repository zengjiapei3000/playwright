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

it('should timeout waiting for stable position', async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/button.html');
  const button = await page.$('button');
  await button.evaluate(button => {
    button.style.transition = 'margin 5s linear 0s';
    button.style.marginLeft = '200px';
  });
  const error = await button.click({ timeout: 3000 }).catch(e => e);
  expect(error.message).toContain('elementHandle.click: Timeout 3000ms exceeded.');
  expect(error.message).toContain('waiting for element to be visible, enabled and not moving');
  expect(error.message).toContain('element is moving - waiting');
});
