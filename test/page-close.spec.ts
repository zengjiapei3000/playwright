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

import { it, expect } from './fixtures';

it('should close page with active dialog', async ({context}) => {
  const page = await context.newPage();
  await page.setContent(`<button onclick="setTimeout(() => alert(1))">alert</button>`);
  page.click('button');
  await page.waitForEvent('dialog');
  await page.close();
});

it('should not accept after close', async ({page}) => {
  page.evaluate(() => alert()).catch(() => {});
  const dialog = await page.waitForEvent('dialog');
  await page.close();
  const e = await dialog.dismiss().catch(e => e);
  expect(e.message).toContain('Target page, context or browser has been closed');
});
