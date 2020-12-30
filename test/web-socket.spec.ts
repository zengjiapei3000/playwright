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

it('should work', async ({ page, server }) => {
  const value = await page.evaluate(port => {
    let cb;
    const result = new Promise(f => cb = f);
    const ws = new WebSocket('ws://localhost:' + port + '/ws');
    ws.addEventListener('message', data => { ws.close(); cb(data.data); });
    return result;
  }, server.PORT);
  expect(value).toBe('incoming');
});

it('should emit close events', async ({ page, server }) => {
  let socketClosed;
  const socketClosePromise = new Promise(f => socketClosed = f);
  const log = [];
  let webSocket;
  page.on('websocket', ws => {
    log.push(`open<${ws.url()}>`);
    webSocket = ws;
    ws.on('close', () => { log.push('close'); socketClosed(); });
  });
  await page.evaluate(port => {
    const ws = new WebSocket('ws://localhost:' + port + '/ws');
    ws.addEventListener('open', () => ws.close());
  }, server.PORT);
  await socketClosePromise;
  expect(log.join(':')).toBe(`open<ws://localhost:${server.PORT}/ws>:close`);
  expect(webSocket.isClosed()).toBeTruthy();
});

it('should emit frame events', async ({ page, server, isFirefox }) => {
  let socketClosed;
  const socketClosePromise = new Promise(f => socketClosed = f);
  const log = [];
  page.on('websocket', ws => {
    log.push('open');
    ws.on('framesent', d => log.push('sent<' + d.payload + '>'));
    ws.on('framereceived', d => log.push('received<' + d.payload + '>'));
    ws.on('close', () => { log.push('close'); socketClosed(); });
  });
  await page.evaluate(port => {
    const ws = new WebSocket('ws://localhost:' + port + '/ws');
    ws.addEventListener('open', () => ws.send('outgoing'));
    ws.addEventListener('message', () => { ws.close(); });
  }, server.PORT);
  await socketClosePromise;
  expect(log[0]).toBe('open');
  expect(log[3]).toBe('close');
  log.sort();
  expect(log.join(':')).toBe('close:open:received<incoming>:sent<outgoing>');
});

it('should emit binary frame events', async ({ page, server }) => {
  let doneCallback;
  const donePromise = new Promise(f => doneCallback = f);
  const sent = [];
  page.on('websocket', ws => {
    ws.on('close', doneCallback);
    ws.on('framesent', d => sent.push(d.payload));
  });
  await page.evaluate(port => {
    const ws = new WebSocket('ws://localhost:' + port + '/ws');
    ws.addEventListener('open', () => {
      const binary = new Uint8Array(5);
      for (let i = 0; i < 5; ++i)
        binary[i] = i;
      ws.send('text');
      ws.send(binary);
      ws.close();
    });
  }, server.PORT);
  await donePromise;
  expect(sent[0]).toBe('text');
  for (let i = 0; i < 5; ++i)
    expect(sent[1][i]).toBe(i);
});

it('should emit error', async ({page, server, isFirefox}) => {
  let callback;
  const result = new Promise(f => callback = f);
  page.on('websocket', ws => ws.on('socketerror', callback));
  page.evaluate(port => {
    new WebSocket('ws://localhost:' + port + '/bogus-ws');
  }, server.PORT);
  const message = await result;
  if (isFirefox)
    expect(message).toBe('CLOSE_ABNORMAL');
  else
    expect(message).toContain(': 400');
});

it('should not have stray error events', async ({page, server}) => {
  let error;
  page.on('websocket', ws => ws.on('socketerror', e => error = e));
  await Promise.all([
    page.waitForEvent('websocket').then(async ws => {
      await ws.waitForEvent('framereceived');
      return ws;
    }),
    page.evaluate(port => {
      (window as any).ws = new WebSocket('ws://localhost:' + port + '/ws');
    }, server.PORT)
  ]);
  await page.evaluate('window.ws.close()');
  expect(error).toBeFalsy();
});

it('should reject waitForEvent on socket close', async ({page, server}) => {
  const [ws] = await Promise.all([
    page.waitForEvent('websocket').then(async ws => {
      await ws.waitForEvent('framereceived');
      return ws;
    }),
    page.evaluate(port => {
      (window as any).ws = new WebSocket('ws://localhost:' + port + '/ws');
    }, server.PORT)
  ]);
  const error = ws.waitForEvent('framesent').catch(e => e);
  await page.evaluate('window.ws.close()');
  expect((await error).message).toContain('Socket closed');
});

it('should reject waitForEvent on page close', async ({page, server}) => {
  const [ws] = await Promise.all([
    page.waitForEvent('websocket').then(async ws => {
      await ws.waitForEvent('framereceived');
      return ws;
    }),
    page.evaluate(port => {
      (window as any).ws = new WebSocket('ws://localhost:' + port + '/ws');
    }, server.PORT)
  ]);
  const error = ws.waitForEvent('framesent').catch(e => e);
  await page.close();
  expect((await error).message).toContain('Page closed');
});
