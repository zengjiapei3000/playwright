/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License");
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

import * as channels from '../protocol/channels';
import { DeviceDescriptors } from '../server/deviceDescriptors';
import { Playwright } from '../server/playwright';
import { AndroidDispatcher } from './androidDispatcher';
import { BrowserTypeDispatcher } from './browserTypeDispatcher';
import { Dispatcher, DispatcherScope } from './dispatcher';
import { ElectronDispatcher } from './electronDispatcher';
import { SelectorsDispatcher } from './selectorsDispatcher';

export class PlaywrightDispatcher extends Dispatcher<Playwright, channels.PlaywrightInitializer> implements channels.PlaywrightChannel {
  constructor(scope: DispatcherScope, playwright: Playwright) {
    const deviceDescriptors = Object.entries(DeviceDescriptors)
        .map(([name, descriptor]) => ({ name, descriptor }));
    super(scope, playwright, 'Playwright', {
      chromium: new BrowserTypeDispatcher(scope, playwright.chromium),
      firefox: new BrowserTypeDispatcher(scope, playwright.firefox),
      webkit: new BrowserTypeDispatcher(scope, playwright.webkit),
      android: new AndroidDispatcher(scope, playwright.android),
      electron: new ElectronDispatcher(scope, playwright.electron),
      deviceDescriptors,
      selectors: new SelectorsDispatcher(scope, playwright.selectors),
    }, false, 'Playwright');
  }
}
