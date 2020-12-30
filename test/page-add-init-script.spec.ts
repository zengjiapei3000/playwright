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
import path from 'path';

it('should evaluate before anything else on the page', async ({ page, server }) => {
  await page.addInitScript(function() {
    window['injected'] = 123;
  });
  await page.goto(server.PREFIX + '/tamperable.html');
  expect(await page.evaluate(() => window['result'])).toBe(123);
});

it('should work with a path', async ({ page, server }) => {
  await page.addInitScript({ path: path.join(__dirname, 'assets/injectedfile.js') });
  await page.goto(server.PREFIX + '/tamperable.html');
  expect(await page.evaluate(() => window['result'])).toBe(123);
});

it('should work with content', async ({ page, server }) => {
  await page.addInitScript({ content: 'window["injected"] = 123' });
  await page.goto(server.PREFIX + '/tamperable.html');
  expect(await page.evaluate(() => window['result'])).toBe(123);
});

it('should throw without path and content', async ({ page, server }) => {
  // @ts-expect-error foo is not a real option of addInitScript
  const error = await page.addInitScript({ foo: 'bar' }).catch(e => e);
  expect(error.message).toContain('Either path or content property must be present');
});

it('should work with browser context scripts', async ({ browser, server }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => window['temp'] = 123);
  const page = await context.newPage();
  await page.addInitScript(() => window['injected'] = window['temp']);
  await page.goto(server.PREFIX + '/tamperable.html');
  expect(await page.evaluate(() => window['result'])).toBe(123);
  await context.close();
});

it('should work with browser context scripts with a path', async ({ browser, server }) => {
  const context = await browser.newContext();
  await context.addInitScript({ path: path.join(__dirname, 'assets/injectedfile.js') });
  const page = await context.newPage();
  await page.goto(server.PREFIX + '/tamperable.html');
  expect(await page.evaluate(() => window['result'])).toBe(123);
  await context.close();
});

it('should work with browser context scripts for already created pages', async ({ browser, server }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await context.addInitScript(() => window['temp'] = 123);
  await page.addInitScript(() => window['injected'] = window['temp']);
  await page.goto(server.PREFIX + '/tamperable.html');
  expect(await page.evaluate(() => window['result'])).toBe(123);
  await context.close();
});

it('should support multiple scripts', async ({ page, server }) => {
  await page.addInitScript(function() {
    window['script1'] = 1;
  });
  await page.addInitScript(function() {
    window['script2'] = 2;
  });
  await page.goto(server.PREFIX + '/tamperable.html');
  expect(await page.evaluate(() => window['script1'])).toBe(1);
  expect(await page.evaluate(() => window['script2'])).toBe(2);
});

it('should work with CSP', async ({ page, server }) => {
  server.setCSP('/empty.html', 'script-src ' + server.PREFIX);
  await page.addInitScript(function() {
    window['injected'] = 123;
  });
  await page.goto(server.PREFIX + '/empty.html');
  expect(await page.evaluate(() => window['injected'])).toBe(123);

  // Make sure CSP works.
  await page.addScriptTag({ content: 'window.e = 10;' }).catch(e => void e);
  expect(await page.evaluate(() => window['e'])).toBe(undefined);
});

it('should work after a cross origin navigation', async ({ page, server }) => {
  await page.goto(server.CROSS_PROCESS_PREFIX);
  await page.addInitScript(function() {
    window['injected'] = 123;
  });
  await page.goto(server.PREFIX + '/tamperable.html');
  expect(await page.evaluate(() => window['result'])).toBe(123);
});
