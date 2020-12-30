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

it('should close browser with beforeunload page', (test, {browserName}) => {
}, async ({server, browserType, browserOptions }) => {
  const browser = await browserType.launch(browserOptions);
  const page = await browser.newPage();
  await page.goto(server.PREFIX + '/beforeunload.html');
  // We have to interact with a page so that 'beforeunload' handlers
  // fire.
  await page.click('body');
  await browser.close();
});

it('should close browsercontext with beforeunload page', (test, {browserName}) => {
}, async ({server, contextFactory }) => {
  const browserContext = await contextFactory();
  const page = await browserContext.newPage();
  await page.goto(server.PREFIX + '/beforeunload.html');
  // We have to interact with a page so that 'beforeunload' handlers
  // fire.
  await page.click('body');
  await browserContext.close();
});

it('should close page with beforeunload listener', async ({context, server}) => {
  const newPage = await context.newPage();
  await newPage.goto(server.PREFIX + '/beforeunload.html');
  // We have to interact with a page so that 'beforeunload' handlers
  // fire.
  await newPage.click('body');
  await newPage.close();
});

it('should run beforeunload if asked for', async ({context, server, isChromium, isWebKit}) => {
  const newPage = await context.newPage();
  await newPage.goto(server.PREFIX + '/beforeunload.html');
  // We have to interact with a page so that 'beforeunload' handlers
  // fire.
  await newPage.click('body');
  const [dialog] = await Promise.all([
    newPage.waitForEvent('dialog'),
    newPage.close({ runBeforeUnload: true })
  ]);
  expect(dialog.type()).toBe('beforeunload');
  expect(dialog.defaultValue()).toBe('');
  if (isChromium)
    expect(dialog.message()).toBe('');
  else if (isWebKit)
    expect(dialog.message()).toBe('Leave?');
  else
    expect(dialog.message()).toBe('This page is asking you to confirm that you want to leave - data you have entered may not be saved.');
  await Promise.all([
    dialog.accept(),
    newPage.waitForEvent('close'),
  ]);
});

it('should access page after beforeunload', async ({contextFactory, server}) => {
  const context = await contextFactory();
  const page = await context.newPage();
  await page.goto(server.PREFIX + '/beforeunload.html');
  // We have to interact with a page so that 'beforeunload' handlers
  // fire.
  await page.click('body');
  const [dialog] = await Promise.all([
    page.waitForEvent('dialog'),
    page.close({ runBeforeUnload: true }),
  ]);
  await dialog.dismiss();
  await page.evaluate(() => document.title);
});

