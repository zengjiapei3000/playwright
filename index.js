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

const { setUnderTest } = require('./lib/utils/utils');
setUnderTest(); // Note: we must call setUnderTest before initializing.

const { Playwright } = require('./lib/server/playwright');
const { setupInProcess } = require('./lib/inprocess');
const path = require('path');

const playwright = new Playwright(__dirname, require(path.join(__dirname, 'browsers.json'))['browsers']);
module.exports = setupInProcess(playwright);
