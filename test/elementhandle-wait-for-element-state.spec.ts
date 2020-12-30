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

async function giveItAChanceToResolve(page) {
  for (let i = 0; i < 5; i++)
    await page.evaluate(() => new Promise(f => requestAnimationFrame(() => requestAnimationFrame(f))));
}

it('should wait for visible', async ({ page }) => {
  await page.setContent(`<div style='display:none'>content</div>`);
  const div = await page.$('div');
  let done = false;
  const promise = div.waitForElementState('visible').then(() => done = true);
  await giveItAChanceToResolve(page);
  expect(done).toBe(false);
  await div.evaluate(div => div.style.display = 'block');
  await promise;
});

it('should wait for already visible', async ({ page }) => {
  await page.setContent(`<div>content</div>`);
  const div = await page.$('div');
  await div.waitForElementState('visible');
});

it('should timeout waiting for visible', async ({ page }) => {
  await page.setContent(`<div style='display:none'>content</div>`);
  const div = await page.$('div');
  const error = await div.waitForElementState('visible', { timeout: 1000 }).catch(e => e);
  expect(error.message).toContain('Timeout 1000ms exceeded');
});

it('should throw waiting for visible when detached', async ({ page }) => {
  await page.setContent(`<div style='display:none'>content</div>`);
  const div = await page.$('div');
  const promise = div.waitForElementState('visible').catch(e => e);
  await div.evaluate(div => div.remove());
  const error = await promise;
  expect(error.message).toContain('Element is not attached to the DOM');
});

it('should wait for hidden', async ({ page }) => {
  await page.setContent(`<div>content</div>`);
  const div = await page.$('div');
  let done = false;
  const promise = div.waitForElementState('hidden').then(() => done = true);
  await giveItAChanceToResolve(page);
  expect(done).toBe(false);
  await div.evaluate(div => div.style.display = 'none');
  await promise;
});

it('should wait for already hidden', async ({ page }) => {
  await page.setContent(`<div></div>`);
  const div = await page.$('div');
  await div.waitForElementState('hidden');
});

it('should wait for hidden when detached', async ({ page }) => {
  await page.setContent(`<div>content</div>`);
  const div = await page.$('div');
  let done = false;
  const promise = div.waitForElementState('hidden').then(() => done = true);
  await giveItAChanceToResolve(page);
  expect(done).toBe(false);
  await div.evaluate(div => div.remove());
  await promise;
});

it('should wait for enabled button', async ({page, server}) => {
  await page.setContent('<button disabled><span>Target</span></button>');
  const span = await page.$('text=Target');
  let done = false;
  const promise = span.waitForElementState('enabled').then(() => done = true);
  await giveItAChanceToResolve(page);
  expect(done).toBe(false);
  await span.evaluate(span => (span.parentElement as HTMLButtonElement).disabled = false);
  await promise;
});

it('should throw waiting for enabled when detached', async ({ page }) => {
  await page.setContent(`<button disabled>Target</button>`);
  const button = await page.$('button');
  const promise = button.waitForElementState('enabled').catch(e => e);
  await button.evaluate(button => button.remove());
  const error = await promise;
  expect(error.message).toContain('Element is not attached to the DOM');
});

it('should wait for disabled button', async ({page}) => {
  await page.setContent('<button><span>Target</span></button>');
  const span = await page.$('text=Target');
  let done = false;
  const promise = span.waitForElementState('disabled').then(() => done = true);
  await giveItAChanceToResolve(page);
  expect(done).toBe(false);
  await span.evaluate(span => (span.parentElement as HTMLButtonElement).disabled = true);
  await promise;
});

it('should wait for stable position', (test, { browserName, platform }) => {
  test.fixme(browserName === 'firefox' && platform === 'linux');
}, async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/button.html');
  const button = await page.$('button');
  await page.$eval('button', button => {
    button.style.transition = 'margin 10000ms linear 0s';
    button.style.marginLeft = '20000px';
  });
  let done = false;
  const promise = button.waitForElementState('stable').then(() => done = true);
  await giveItAChanceToResolve(page);
  expect(done).toBe(false);
  await button.evaluate(button => button.style.transition = '');
  await promise;
});
