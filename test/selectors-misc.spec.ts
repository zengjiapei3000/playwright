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
import * as path from 'path';

const { selectorsV2Enabled } = require(path.join(__dirname, '..', 'lib', 'server', 'common', 'selectorParser'));

it('should work for open shadow roots', async ({page, server}) => {
  await page.goto(server.PREFIX + '/deep-shadow.html');
  expect(await page.$eval(`id=target`, e => e.textContent)).toBe('Hello from root2');
  expect(await page.$eval(`data-testid=foo`, e => e.textContent)).toBe('Hello from root1');
  expect(await page.$$eval(`data-testid=foo`, els => els.length)).toBe(3);
  expect(await page.$(`id:light=target`)).toBe(null);
  expect(await page.$(`data-testid:light=foo`)).toBe(null);
  expect(await page.$$(`data-testid:light=foo`)).toEqual([]);
});

it('should work with :visible', async ({page}) => {
  if (!selectorsV2Enabled())
    return; // Selectors v1 do not support this.
  await page.setContent(`
    <section>
      <div id=target1></div>
      <div id=target2></div>
    </section>
  `);
  expect(await page.$('div:visible')).toBe(null);

  const error = await page.waitForSelector(`div:visible`, { timeout: 100 }).catch(e => e);
  expect(error.message).toContain('100ms');

  const promise = page.waitForSelector(`div:visible`, { state: 'attached' });
  await page.$eval('#target2', div => div.textContent = 'Now visible');
  const element = await promise;
  expect(await element.evaluate(e => e.id)).toBe('target2');

  expect(await page.$eval('div:visible', div => div.id)).toBe('target2');
});

it('should work with proximity selectors', test => {
  test.skip('Not ready yet');
}, async ({page}) => {
  if (!selectorsV2Enabled())
    return; // Selectors v1 do not support this.

  /*

       +--+  +--+
       | 1|  | 2|
       +--+  ++-++
       | 3|   | 4|
  +-------+  ++-++
  |   0   |  | 5|
  | +--+  +--+--+
  | | 6|  | 7|
  | +--+  +--+
  |       |
  O-------+
          +--+
          | 8|
          +--++--+
              | 9|
              +--+

  */

  const boxes = [
    // x, y, width, height
    [0, 0, 150, 150],
    [100, 200, 50, 50],
    [200, 200, 50, 50],
    [100, 150, 50, 50],
    [201, 150, 50, 50],
    [200, 100, 50, 50],
    [50, 50, 50, 50],
    [150, 50, 50, 50],
    [150, -51, 50, 50],
    [201, -101, 50, 50],
  ];
  await page.setContent(`<container style="width: 500px; height: 500px; position: relative;"></container>`);
  await page.$eval('container', (container, boxes) => {
    for (let i = 0; i < boxes.length; i++) {
      const div = document.createElement('div');
      div.style.position = 'absolute';
      div.style.overflow = 'hidden';
      div.style.boxSizing = 'border-box';
      div.style.border = '1px solid black';
      div.id = 'id' + i;
      div.textContent = 'id' + i;
      const box = boxes[i];
      div.style.left = box[0] + 'px';
      // Note that top is a flipped y coordinate.
      div.style.top = (250 - box[1] - box[3]) + 'px';
      div.style.width = box[2] + 'px';
      div.style.height = box[3] + 'px';
      container.appendChild(div);
    }
  }, boxes);

  expect(await page.$eval('div:within(#id0)', e => e.id)).toBe('id6');
  expect(await page.$eval('div:within(div)', e => e.id)).toBe('id6');
  expect(await page.$('div:within(#id6)')).toBe(null);
  expect(await page.$$eval('div:within(#id0)', els => els.map(e => e.id).join(','))).toBe('id6');

  expect(await page.$eval('div:right-of(#id6)', e => e.id)).toBe('id7');
  expect(await page.$eval('div:right-of(#id1)', e => e.id)).toBe('id2');
  expect(await page.$eval('div:right-of(#id3)', e => e.id)).toBe('id2');
  expect(await page.$('div:right-of(#id4)')).toBe(null);
  expect(await page.$eval('div:right-of(#id0)', e => e.id)).toBe('id4');
  expect(await page.$eval('div:right-of(#id8)', e => e.id)).toBe('id9');
  expect(await page.$$eval('div:right-of(#id3)', els => els.map(e => e.id).join(','))).toBe('id2,id5');

  expect(await page.$eval('div:left-of(#id2)', e => e.id)).toBe('id1');
  expect(await page.$('div:left-of(#id0)')).toBe(null);
  expect(await page.$eval('div:left-of(#id5)', e => e.id)).toBe('id0');
  expect(await page.$eval('div:left-of(#id9)', e => e.id)).toBe('id8');
  expect(await page.$eval('div:left-of(#id4)', e => e.id)).toBe('id0');
  expect(await page.$$eval('div:left-of(#id5)', els => els.map(e => e.id).join(','))).toBe('id0,id3,id7');

  expect(await page.$eval('div:above(#id0)', e => e.id)).toBe('id1');
  expect(await page.$eval('div:above(#id5)', e => e.id)).toBe('id2');
  expect(await page.$eval('div:above(#id7)', e => e.id)).toBe('id3');
  expect(await page.$eval('div:above(#id8)', e => e.id)).toBe('id0');
  expect(await page.$('div:above(#id2)')).toBe(null);
  expect(await page.$('div:above(#id9)')).toBe(null);
  expect(await page.$$eval('div:above(#id5)', els => els.map(e => e.id).join(','))).toBe('id2,id4');

  expect(await page.$eval('div:below(#id4)', e => e.id)).toBe('id5');
  expect(await page.$eval('div:below(#id3)', e => e.id)).toBe('id0');
  expect(await page.$eval('div:below(#id2)', e => e.id)).toBe('id4');
  expect(await page.$('div:below(#id9)')).toBe(null);
  expect(await page.$('div:below(#id7)')).toBe(null);
  expect(await page.$('div:below(#id8)')).toBe(null);
  expect(await page.$('div:below(#id6)')).toBe(null);
  expect(await page.$$eval('div:below(#id3)', els => els.map(e => e.id).join(','))).toBe('id0,id6,id7');

  expect(await page.$eval('div:near(#id0)', e => e.id)).toBe('id1');
  expect(await page.$$eval('div:near(#id7)', els => els.map(e => e.id).join(','))).toBe('id0,id3,id4,id5,id6');
  expect(await page.$$eval('div:near(#id0)', els => els.map(e => e.id).join(','))).toBe('id1,id2,id3,id4,id5,id7,id8,id9');
});

it('should escape the scope with >>', async ({ page }) => {
  await page.setContent(`<div><label>Test</label><input id='myinput'></div>`);
  expect(await page.$eval(`label >> xpath=.. >> input`, e => e.id)).toBe('myinput');
});
