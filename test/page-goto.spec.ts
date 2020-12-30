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

import path from 'path';
import url from 'url';
import { expect, it } from './fixtures';
import { expectedSSLError } from './utils';

it('should work', async ({page, server}) => {
  await page.goto(server.EMPTY_PAGE);
  expect(page.url()).toBe(server.EMPTY_PAGE);
});

it('should work with file URL', async ({page}) => {
  const fileurl = url.pathToFileURL(path.join(__dirname, 'assets', 'frames', 'two-frames.html')).href;
  await page.goto(fileurl);
  expect(page.url().toLowerCase()).toBe(fileurl.toLowerCase());
  expect(page.frames().length).toBe(3);
});

it('should use http for no protocol', async ({page, server}) => {
  await page.goto(server.EMPTY_PAGE.substring('http://'.length));
  expect(page.url()).toBe(server.EMPTY_PAGE);
});

it('should work cross-process', async ({page, server}) => {
  await page.goto(server.EMPTY_PAGE);
  expect(page.url()).toBe(server.EMPTY_PAGE);

  const url = server.CROSS_PROCESS_PREFIX + '/empty.html';
  let requestFrame;
  page.on('request', r => {
    if (r.url() === url)
      requestFrame = r.frame();
  });
  const response = await page.goto(url);
  expect(page.url()).toBe(url);
  expect(response.frame()).toBe(page.mainFrame());
  expect(requestFrame).toBe(page.mainFrame());
  expect(response.url()).toBe(url);
});

it('should capture iframe navigation request', async ({page, server}) => {
  await page.goto(server.EMPTY_PAGE);
  expect(page.url()).toBe(server.EMPTY_PAGE);

  let requestFrame;
  page.on('request', r => {
    if (r.url() === server.PREFIX + '/frames/frame.html')
      requestFrame = r.frame();
  });
  const response = await page.goto(server.PREFIX + '/frames/one-frame.html');
  expect(page.url()).toBe(server.PREFIX + '/frames/one-frame.html');
  expect(response.frame()).toBe(page.mainFrame());
  expect(response.url()).toBe(server.PREFIX + '/frames/one-frame.html');

  expect(page.frames().length).toBe(2);
  expect(requestFrame).toBe(page.frames()[1]);
});

it('should capture cross-process iframe navigation request', async ({page, server}) => {
  await page.goto(server.EMPTY_PAGE);
  expect(page.url()).toBe(server.EMPTY_PAGE);

  let requestFrame;
  page.on('request', r => {
    if (r.url() === server.CROSS_PROCESS_PREFIX + '/frames/frame.html')
      requestFrame = r.frame();
  });
  const response = await page.goto(server.CROSS_PROCESS_PREFIX + '/frames/one-frame.html');
  expect(page.url()).toBe(server.CROSS_PROCESS_PREFIX + '/frames/one-frame.html');
  expect(response.frame()).toBe(page.mainFrame());
  expect(response.url()).toBe(server.CROSS_PROCESS_PREFIX + '/frames/one-frame.html');

  expect(page.frames().length).toBe(2);
  expect(requestFrame).toBe(page.frames()[1]);
});

it('should work with anchor navigation', async ({page, server}) => {
  await page.goto(server.EMPTY_PAGE);
  expect(page.url()).toBe(server.EMPTY_PAGE);
  await page.goto(server.EMPTY_PAGE + '#foo');
  expect(page.url()).toBe(server.EMPTY_PAGE + '#foo');
  await page.goto(server.EMPTY_PAGE + '#bar');
  expect(page.url()).toBe(server.EMPTY_PAGE + '#bar');
});

it('should work with redirects', async ({page, server}) => {
  server.setRedirect('/redirect/1.html', '/redirect/2.html');
  server.setRedirect('/redirect/2.html', '/empty.html');
  const response = await page.goto(server.PREFIX + '/redirect/1.html');
  expect(response.status()).toBe(200);
  expect(page.url()).toBe(server.EMPTY_PAGE);
});

it('should navigate to about:blank', async ({page, server}) => {
  const response = await page.goto('about:blank');
  expect(response).toBe(null);
});

it('should return response when page changes its URL after load', async ({page, server}) => {
  const response = await page.goto(server.PREFIX + '/historyapi.html');
  expect(response.status()).toBe(200);
});

it('should work with subframes return 204', async ({page, server}) => {
  server.setRoute('/frames/frame.html', (req, res) => {
    res.statusCode = 204;
    res.end();
  });
  await page.goto(server.PREFIX + '/frames/one-frame.html');
});

it('should work with subframes return 204 with domcontentloaded', async ({page, server}) => {
  server.setRoute('/frames/frame.html', (req, res) => {
    res.statusCode = 204;
    res.end();
  });
  await page.goto(server.PREFIX + '/frames/one-frame.html', { waitUntil: 'domcontentloaded' });
});

it('should fail when server returns 204', async ({page, server, isChromium, isWebKit}) => {
  // Webkit just loads an empty page.
  server.setRoute('/empty.html', (req, res) => {
    res.statusCode = 204;
    res.end();
  });
  let error = null;
  await page.goto(server.EMPTY_PAGE).catch(e => error = e);
  expect(error).not.toBe(null);
  if (isChromium)
    expect(error.message).toContain('net::ERR_ABORTED');
  else if (isWebKit)
    expect(error.message).toContain('Aborted: 204 No Content');
  else
    expect(error.message).toContain('NS_BINDING_ABORTED');
});

it('should navigate to empty page with domcontentloaded', async ({page, server}) => {
  const response = await page.goto(server.EMPTY_PAGE, {waitUntil: 'domcontentloaded'});
  expect(response.status()).toBe(200);
});

it('should work when page calls history API in beforeunload', async ({page, server}) => {
  await page.goto(server.EMPTY_PAGE);
  await page.evaluate(() => {
    window.addEventListener('beforeunload', () => history.replaceState(null, 'initial', window.location.href), false);
  });
  const response = await page.goto(server.PREFIX + '/grid.html');
  expect(response.status()).toBe(200);
});

it('should fail when navigating to bad url', async ({page, isChromium, isWebKit}) => {
  let error = null;
  await page.goto('asdfasdf').catch(e => error = e);
  if (isChromium || isWebKit)
    expect(error.message).toContain('Cannot navigate to invalid URL');
  else
    expect(error.message).toContain('Invalid url');
});

it('should fail when navigating to bad SSL', async ({page, browserName, httpsServer}) => {
  // Make sure that network events do not emit 'undefined'.
  // @see https://crbug.com/750469
  page.on('request', request => expect(request).toBeTruthy());
  page.on('requestfinished', request => expect(request).toBeTruthy());
  page.on('requestfailed', request => expect(request).toBeTruthy());
  let error = null;
  await page.goto(httpsServer.EMPTY_PAGE).catch(e => error = e);
  expect(error.message).toContain(expectedSSLError(browserName));
});

it('should fail when navigating to bad SSL after redirects', async ({page, browserName, server, httpsServer}) => {
  server.setRedirect('/redirect/1.html', '/redirect/2.html');
  server.setRedirect('/redirect/2.html', '/empty.html');
  let error = null;
  await page.goto(httpsServer.PREFIX + '/redirect/1.html').catch(e => error = e);
  expect(error.message).toContain(expectedSSLError(browserName));
});

it('should not crash when navigating to bad SSL after a cross origin navigation', async ({page, server, httpsServer}) => {
  await page.goto(server.CROSS_PROCESS_PREFIX + '/empty.html');
  await page.goto(httpsServer.EMPTY_PAGE).catch(e => void 0);
});

it('should not throw if networkidle0 is passed as an option', async ({page, server}) => {
  // @ts-expect-error networkidle0 is undocumented
  await page.goto(server.EMPTY_PAGE, {waitUntil: 'networkidle0'});
});

it('should throw if networkidle2 is passed as an option', async ({page, server}) => {
  let error = null;
  // @ts-expect-error networkidle2 is not allowed
  await page.goto(server.EMPTY_PAGE, {waitUntil: 'networkidle2'}).catch(err => error = err);
  expect(error.message).toContain(`waitUntil: expected one of (load|domcontentloaded|networkidle)`);
});

it('should fail when main resources failed to load', async ({page, isChromium, isWebKit, isWindows}) => {
  let error = null;
  await page.goto('http://localhost:44123/non-existing-url').catch(e => error = e);
  if (isChromium)
    expect(error.message).toContain('net::ERR_CONNECTION_REFUSED');
  else if (isWebKit && isWindows)
    expect(error.message).toContain(`Couldn\'t connect to server`);
  else if (isWebKit)
    expect(error.message).toContain('Could not connect');
  else
    expect(error.message).toContain('NS_ERROR_CONNECTION_REFUSED');
});

it('should fail when exceeding maximum navigation timeout', async ({page, server, playwright}) => {
  // Hang for request to the empty.html
  server.setRoute('/empty.html', (req, res) => { });
  let error = null;
  await page.goto(server.PREFIX + '/empty.html', {timeout: 1}).catch(e => error = e);
  expect(error.message).toContain('page.goto: Timeout 1ms exceeded.');
  expect(error.message).toContain(server.PREFIX + '/empty.html');
  expect(error).toBeInstanceOf(playwright.errors.TimeoutError);
});

it('should fail when exceeding default maximum navigation timeout', async ({page, server, playwright}) => {
  // Hang for request to the empty.html
  server.setRoute('/empty.html', (req, res) => { });
  let error = null;
  page.context().setDefaultNavigationTimeout(2);
  page.setDefaultNavigationTimeout(1);
  await page.goto(server.PREFIX + '/empty.html').catch(e => error = e);
  expect(error.message).toContain('page.goto: Timeout 1ms exceeded.');
  expect(error.message).toContain(server.PREFIX + '/empty.html');
  expect(error).toBeInstanceOf(playwright.errors.TimeoutError);
});

it('should fail when exceeding browser context navigation timeout', async ({page, server, playwright}) => {
  // Hang for request to the empty.html
  server.setRoute('/empty.html', (req, res) => { });
  let error = null;
  page.context().setDefaultNavigationTimeout(2);
  await page.goto(server.PREFIX + '/empty.html').catch(e => error = e);
  expect(error.message).toContain('page.goto: Timeout 2ms exceeded.');
  expect(error.message).toContain(server.PREFIX + '/empty.html');
  expect(error).toBeInstanceOf(playwright.errors.TimeoutError);
});

it('should fail when exceeding default maximum timeout', async ({page, server, playwright}) => {
  // Hang for request to the empty.html
  server.setRoute('/empty.html', (req, res) => { });
  let error = null;
  page.context().setDefaultTimeout(2);
  page.setDefaultTimeout(1);
  await page.goto(server.PREFIX + '/empty.html').catch(e => error = e);
  expect(error.message).toContain('page.goto: Timeout 1ms exceeded.');
  expect(error.message).toContain(server.PREFIX + '/empty.html');
  expect(error).toBeInstanceOf(playwright.errors.TimeoutError);
});

it('should fail when exceeding browser context timeout', async ({page, server, playwright}) => {
  // Hang for request to the empty.html
  server.setRoute('/empty.html', (req, res) => { });
  let error = null;
  page.context().setDefaultTimeout(2);
  await page.goto(server.PREFIX + '/empty.html').catch(e => error = e);
  expect(error.message).toContain('page.goto: Timeout 2ms exceeded.');
  expect(error.message).toContain(server.PREFIX + '/empty.html');
  expect(error).toBeInstanceOf(playwright.errors.TimeoutError);
});

it('should prioritize default navigation timeout over default timeout', async ({page, server, playwright}) => {
  // Hang for request to the empty.html
  server.setRoute('/empty.html', (req, res) => { });
  let error = null;
  page.setDefaultTimeout(0);
  page.setDefaultNavigationTimeout(1);
  await page.goto(server.PREFIX + '/empty.html').catch(e => error = e);
  expect(error.message).toContain('page.goto: Timeout 1ms exceeded.');
  expect(error.message).toContain(server.PREFIX + '/empty.html');
  expect(error).toBeInstanceOf(playwright.errors.TimeoutError);
});

it('should disable timeout when its set to 0', async ({page, server}) => {
  let error = null;
  let loaded = false;
  page.once('load', () => loaded = true);
  await page.goto(server.PREFIX + '/grid.html', {timeout: 0, waitUntil: 'load'}).catch(e => error = e);
  expect(error).toBe(null);
  expect(loaded).toBe(true);
});

it('should fail when replaced by another navigation', async ({page, server, isChromium, isWebKit}) => {
  let anotherPromise;
  server.setRoute('/empty.html', (req, res) => {
    anotherPromise = page.goto(server.PREFIX + '/one-style.html');
    // Hang request to empty.html.
  });
  const error = await page.goto(server.PREFIX + '/empty.html').catch(e => e);
  await anotherPromise;
  if (isChromium)
    expect(error.message).toContain('net::ERR_ABORTED');
  else if (isWebKit)
    expect(error.message).toContain('cancelled');
  else
    expect(error.message).toContain('NS_BINDING_ABORTED');
});

it('should work when navigating to valid url', async ({page, server}) => {
  const response = await page.goto(server.EMPTY_PAGE);
  expect(response.ok()).toBe(true);
});

it('should work when navigating to data url', async ({page, server}) => {
  const response = await page.goto('data:text/html,hello');
  expect(response).toBe(null);
});

it('should work when navigating to 404', async ({page, server}) => {
  const response = await page.goto(server.PREFIX + '/not-found');
  expect(response.ok()).toBe(false);
  expect(response.status()).toBe(404);
});

it('should return last response in redirect chain', async ({page, server}) => {
  server.setRedirect('/redirect/1.html', '/redirect/2.html');
  server.setRedirect('/redirect/2.html', '/redirect/3.html');
  server.setRedirect('/redirect/3.html', server.EMPTY_PAGE);
  const response = await page.goto(server.PREFIX + '/redirect/1.html');
  expect(response.ok()).toBe(true);
  expect(response.url()).toBe(server.EMPTY_PAGE);
});

it('should not leak listeners during navigation', async ({page, server}) => {
  let warning = null;
  const warningHandler = w => warning = w;
  process.on('warning', warningHandler);
  for (let i = 0; i < 20; ++i)
    await page.goto(server.EMPTY_PAGE);
  process.off('warning', warningHandler);
  expect(warning).toBe(null);
});

it('should not leak listeners during bad navigation', async ({page, server}) => {
  let warning = null;
  const warningHandler = w => warning = w;
  process.on('warning', warningHandler);
  for (let i = 0; i < 20; ++i)
    await page.goto('asdf').catch(e => {/* swallow navigation error */});
  process.off('warning', warningHandler);
  expect(warning).toBe(null);
});

it('should not leak listeners during navigation of 20 pages', (test, parameters) => {
  test.slow('We open 20 pages here');
}, async ({page, context, server}) => {
  let warning = null;
  const warningHandler = w => warning = w;
  process.on('warning', warningHandler);
  const pages = await Promise.all([...Array(20)].map(() => context.newPage()));
  await Promise.all(pages.map(page => page.goto(server.EMPTY_PAGE)));
  await Promise.all(pages.map(page => page.close()));
  process.off('warning', warningHandler);
  expect(warning).toBe(null);
});

it('should not leak listeners during 20 waitForNavigation', async ({page, context, server}) => {
  let warning = null;
  const warningHandler = w => warning = w;
  process.on('warning', warningHandler);
  const promises = [...Array(20)].map(() => page.waitForNavigation());
  await page.goto(server.EMPTY_PAGE);
  await Promise.all(promises);
  process.off('warning', warningHandler);
  expect(warning).toBe(null);
});

it('should navigate to dataURL and not fire dataURL requests', async ({page, server}) => {
  const requests = [];
  page.on('request', request => requests.push(request));
  const dataURL = 'data:text/html,<div>yo</div>';
  const response = await page.goto(dataURL);
  expect(response).toBe(null);
  expect(requests.length).toBe(0);
});

it('should navigate to URL with hash and fire requests without hash', async ({page, server}) => {
  const requests = [];
  page.on('request', request => requests.push(request));
  const response = await page.goto(server.EMPTY_PAGE + '#hash');
  expect(response.status()).toBe(200);
  expect(response.url()).toBe(server.EMPTY_PAGE);
  expect(requests.length).toBe(1);
  expect(requests[0].url()).toBe(server.EMPTY_PAGE);
});

it('should work with self requesting page', async ({page, server}) => {
  const response = await page.goto(server.PREFIX + '/self-request.html');
  expect(response.status()).toBe(200);
  expect(response.url()).toContain('self-request.html');
});

it('should fail when navigating and show the url at the error message', async function({page, server, httpsServer}) {
  const url = httpsServer.PREFIX + '/redirect/1.html';
  let error = null;
  try {
    await page.goto(url);
  } catch (e) {
    error = e;
  }
  expect(error.message).toContain(url);
});

it('should be able to navigate to a page controlled by service worker', async ({page, server}) => {
  await page.goto(server.PREFIX + '/serviceworkers/fetch/sw.html');
  await page.evaluate(() => window['activationPromise']);
  await page.goto(server.PREFIX + '/serviceworkers/fetch/sw.html');
});

it('should send referer', async ({page, server}) => {
  const [request1, request2] = await Promise.all([
    server.waitForRequest('/grid.html'),
    server.waitForRequest('/digits/1.png'),
    page.goto(server.PREFIX + '/grid.html', {
      referer: 'http://google.com/',
    }),
  ]);
  expect(request1.headers['referer']).toBe('http://google.com/');
  // Make sure subresources do not inherit referer.
  expect(request2.headers['referer']).toBe(server.PREFIX + '/grid.html');
  expect(page.url()).toBe(server.PREFIX + '/grid.html');
});

it('should reject referer option when setExtraHTTPHeaders provides referer', async ({page, server}) => {
  await page.setExtraHTTPHeaders({ 'referer': 'http://microsoft.com/' });
  let error;
  await page.goto(server.PREFIX + '/grid.html', {
    referer: 'http://google.com/',
  }).catch(e => error = e);
  expect(error.message).toContain('"referer" is already specified as extra HTTP header');
  expect(error.message).toContain(server.PREFIX + '/grid.html');
});

it('should override referrer-policy', async ({page, server}) => {
  server.setRoute('/grid.html', (req, res) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    server.serveFile(req, res);
  });
  const [request1, request2] = await Promise.all([
    server.waitForRequest('/grid.html'),
    server.waitForRequest('/digits/1.png'),
    page.goto(server.PREFIX + '/grid.html', {
      referer: 'http://microsoft.com/',
    }),
  ]);
  expect(request1.headers['referer']).toBe('http://microsoft.com/');
  // Make sure subresources do not inherit referer.
  expect(request2.headers['referer']).toBe(undefined);
  expect(page.url()).toBe(server.PREFIX + '/grid.html');
});

it('should fail when canceled by another navigation', async ({page, server}) => {
  server.setRoute('/one-style.html', (req, res) => {});
  const failed = page.goto(server.PREFIX + '/one-style.html').catch(e => e);
  await server.waitForRequest('/one-style.html');
  await page.goto(server.PREFIX + '/empty.html');
  const error = await failed;
  expect(error.message).toBeTruthy();
});

it('should work with lazy loading iframes', async ({page, server}) => {
  await page.goto(server.PREFIX + '/frames/lazy-frame.html');
  expect(page.frames().length).toBe(2);
});

it('should report raw buffer for main resource', (test, { browserName, platform }) => {
  test.fail(browserName === 'chromium', 'Chromium sends main resource as text');
  test.fail(browserName === 'webkit' && platform === 'win32', 'Same here');
}, async ({page, server, playwright}) => {
  server.setRoute('/empty.html', (req, res) => {
    res.statusCode = 200;
    res.end(Buffer.from('Ü (lowercase ü)', 'utf-8'));
  });
  const response = await page.goto(server.PREFIX + '/empty.html');
  const body = await response.body();
  expect(body.toString()).toBe('Ü (lowercase ü)');
});
