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
import * as fs from 'fs';

it('should capture local storage', async ({ context }) => {
  const page1 = await context.newPage();
  await page1.route('**/*', route => {
    route.fulfill({ body: '<html></html>' }).catch(() => {});
  });
  await page1.goto('https://www.example.com');
  await page1.evaluate(() => {
    localStorage['name1'] = 'value1';
  });
  await page1.goto('https://www.domain.com');
  await page1.evaluate(() => {
    localStorage['name2'] = 'value2';
  });
  const { origins } = await context.storageState();
  expect(origins).toEqual([{
    origin: 'https://www.example.com',
    localStorage: [{
      name: 'name1',
      value: 'value1'
    }],
  }, {
    origin: 'https://www.domain.com',
    localStorage: [{
      name: 'name2',
      value: 'value2'
    }],
  }]);
});

it('should set local storage', async ({ browser }) => {
  const context = await browser.newContext({
    storageState: {
      origins: [
        {
          origin: 'https://www.example.com',
          localStorage: [{
            name: 'name1',
            value: 'value1'
          }]
        },
      ]
    }
  });
  const page = await context.newPage();
  await page.route('**/*', route => {
    route.fulfill({ body: '<html></html>' }).catch(() => {});
  });
  await page.goto('https://www.example.com');
  const localStorage = await page.evaluate('window.localStorage');
  expect(localStorage).toEqual({ name1: 'value1' });
  await context.close();
});

it('should round-trip through the file', async ({ browser, context, testInfo }) => {
  const page1 = await context.newPage();
  await page1.route('**/*', route => {
    route.fulfill({ body: '<html></html>' }).catch(() => {});
  });
  await page1.goto('https://www.example.com');
  await page1.evaluate(() => {
    localStorage['name1'] = 'value1';
    document.cookie = 'username=John Doe';
    return document.cookie;
  });

  const path = testInfo.outputPath('storage-state.json');
  const state = await context.storageState({ path });
  const written = await fs.promises.readFile(path, 'utf8');
  expect(JSON.stringify(state)).toBe(written);

  const context2 = await browser.newContext({ storageState: path });
  const page2 = await context2.newPage();
  await page2.route('**/*', route => {
    route.fulfill({ body: '<html></html>' }).catch(() => {});
  });
  await page2.goto('https://www.example.com');
  const localStorage = await page2.evaluate('window.localStorage');
  expect(localStorage).toEqual({ name1: 'value1' });
  const cookie = await page2.evaluate('document.cookie');
  expect(cookie).toEqual('username=John Doe');
  await context2.close();
});
