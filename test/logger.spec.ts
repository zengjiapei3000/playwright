/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { it, expect } from './fixtures';

it('should log', async ({browserType, browserOptions}) => {
  const log = [];
  const browser = await browserType.launch({...browserOptions, logger: {
    log: (name, severity, message) => log.push({name, severity, message}),
    isEnabled: (name, severity) => severity !== 'verbose'
  }});
  await browser.newContext();
  await browser.close();
  expect(log.length > 0).toBeTruthy();
  expect(log.filter(item => item.severity === 'info').length > 0).toBeTruthy();
  expect(log.filter(item => item.message.includes('browserType.launch started')).length > 0).toBeTruthy();
  expect(log.filter(item => item.message.includes('browserType.launch succeeded')).length > 0).toBeTruthy();
});

it('should log context-level', async ({browserType, browserOptions}) => {
  const log = [];
  const browser = await browserType.launch(browserOptions);
  const context = await browser.newContext({
    logger: {
      log: (name, severity, message) => log.push({name, severity, message}),
      isEnabled: (name, severity) => severity !== 'verbose'
    }
  });
  const page = await context.newPage();
  await page.setContent('<button>Button</button>');
  await page.click('button');
  await browser.close();

  expect(log.length > 0).toBeTruthy();
  expect(log.filter(item => item.message.includes('page.setContent')).length > 0).toBeTruthy();
  expect(log.filter(item => item.message.includes('page.click')).length > 0).toBeTruthy();
});
