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

import * as WebSocket from 'ws';
import { Connection } from '../client/connection';
import { Playwright } from '../client/playwright';

export class PlaywrightClient {
  private _playwright: Playwright;
  private _ws: WebSocket;
  private _closePromise: Promise<void>;

  static async connect(wsEndpoint: string): Promise<PlaywrightClient> {
    const connection = new Connection();
    const ws = new WebSocket(wsEndpoint);
    connection.onmessage = message => ws.send(JSON.stringify(message));
    ws.on('message', message => connection.dispatch(JSON.parse(message.toString())));
    const errorPromise = new Promise((_, reject) => ws.on('error', error => reject(error)));
    const closePromise = new Promise((_, reject) => ws.on('close', () => reject(new Error('Connection closed'))));
    const playwright = await Promise.race([
      connection.waitForObjectWithKnownName('Playwright'),
      errorPromise,
      closePromise
    ]);
    return new PlaywrightClient(playwright as Playwright, ws);
  }

  constructor(playwright: Playwright, ws: WebSocket) {
    this._playwright = playwright;
    this._ws = ws;
    this._closePromise = new Promise(f => ws.on('close', f));
  }

  playwright(): Playwright {
    return this._playwright;
  }

  async close() {
    this._ws.close();
    await this._closePromise;
  }
}
