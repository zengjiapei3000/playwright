/**
 * Copyright 2017 Google Inc. All rights reserved.
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

import { EventEmitter } from 'events';
import { TimeoutSettings } from '../utils/timeoutSettings';
import { mkdirIfNeeded } from '../utils/utils';
import { Browser, BrowserOptions } from './browser';
import * as dom from './dom';
import { Download } from './download';
import * as frames from './frames';
import { helper } from './helper';
import * as network from './network';
import { Page, PageBinding, PageDelegate } from './page';
import { Progress, ProgressController, ProgressResult } from './progress';
import { Selectors, serverSelectors } from './selectors';
import * as types from './types';
import * as path from 'path';

export class Video {
  readonly _videoId: string;
  readonly _path: string;
  readonly _relativePath: string;
  readonly _context: BrowserContext;
  readonly _finishedPromise: Promise<void>;
  private _finishCallback: () => void = () => {};
  private _callbackOnFinish?: () => Promise<void>;

  constructor(context: BrowserContext, videoId: string, p: string) {
    this._videoId = videoId;
    this._path = p;
    this._relativePath = path.relative(context._options.recordVideo!.dir, p);
    this._context = context;
    this._finishedPromise = new Promise(fulfill => this._finishCallback = fulfill);
  }

  async _finish() {
    if (this._callbackOnFinish)
      await this._callbackOnFinish();
    this._finishCallback();
  }

  _waitForCallbackOnFinish(callback: () => Promise<void>) {
    this._callbackOnFinish = callback;
  }
}

export type ActionMetadata = {
  type: 'click' | 'fill' | 'dblclick' | 'hover' | 'selectOption' | 'setInputFiles' | 'type' | 'press' | 'check' | 'uncheck' | 'goto' | 'setContent' | 'goBack' | 'goForward' | 'reload' | 'tap',
  page: Page,
  target?: dom.ElementHandle | string,
  value?: string,
  stack?: string,
};

export interface ActionListener {
  onAfterAction(result: ProgressResult, metadata: ActionMetadata): Promise<void>;
}

export async function runAction<T>(task: (controller: ProgressController) => Promise<T>, metadata: ActionMetadata): Promise<T> {
  const controller = new ProgressController();
  controller.setListener(async result => {
    for (const listener of metadata.page._browserContext._actionListeners)
      await listener.onAfterAction(result, metadata);
  });
  const result = await task(controller);
  return result;
}

export interface ContextListener {
  onContextCreated(context: BrowserContext): Promise<void>;
  onContextWillDestroy(context: BrowserContext): Promise<void>;
  onContextDidDestroy(context: BrowserContext): Promise<void>;
}

export const contextListeners = new Set<ContextListener>();

export abstract class BrowserContext extends EventEmitter {
  static Events = {
    Close: 'close',
    Page: 'page',
    VideoStarted: 'videostarted',
  };

  readonly _timeoutSettings = new TimeoutSettings();
  readonly _pageBindings = new Map<string, PageBinding>();
  readonly _options: types.BrowserContextOptions;
  _requestInterceptor?: network.RouteHandler;
  private _isPersistentContext: boolean;
  private _closedStatus: 'open' | 'closing' | 'closed' = 'open';
  readonly _closePromise: Promise<Error>;
  private _closePromiseFulfill: ((error: Error) => void) | undefined;
  readonly _permissions = new Map<string, string[]>();
  readonly _downloads = new Set<Download>();
  readonly _browser: Browser;
  readonly _browserContextId: string | undefined;
  private _selectors?: Selectors;
  readonly _actionListeners = new Set<ActionListener>();
  private _origins = new Set<string>();

  constructor(browser: Browser, options: types.BrowserContextOptions, browserContextId: string | undefined) {
    super();
    this._browser = browser;
    this._options = options;
    this._browserContextId = browserContextId;
    this._isPersistentContext = !browserContextId;
    this._closePromise = new Promise(fulfill => this._closePromiseFulfill = fulfill);
  }

  _setSelectors(selectors: Selectors) {
    this._selectors = selectors;
  }

  selectors() {
    return this._selectors || serverSelectors;
  }

  async _initialize() {
    for (const listener of contextListeners)
      await listener.onContextCreated(this);
  }

  async _ensureVideosPath() {
    if (this._options.recordVideo)
      await mkdirIfNeeded(path.join(this._options.recordVideo.dir, 'dummy'));
  }

  _browserClosed() {
    for (const page of this.pages())
      page._didClose();
    this._didCloseInternal();
  }

  private _didCloseInternal() {
    if (this._closedStatus === 'closed') {
      // We can come here twice if we close browser context and browser
      // at the same time.
      return;
    }
    this._closedStatus = 'closed';
    this._downloads.clear();
    this._closePromiseFulfill!(new Error('Context closed'));
    this.emit(BrowserContext.Events.Close);
  }

  // BrowserContext methods.
  abstract pages(): Page[];
  abstract newPageDelegate(): Promise<PageDelegate>;
  abstract _doCookies(urls: string[]): Promise<types.NetworkCookie[]>;
  abstract addCookies(cookies: types.SetNetworkCookieParam[]): Promise<void>;
  abstract clearCookies(): Promise<void>;
  abstract _doGrantPermissions(origin: string, permissions: string[]): Promise<void>;
  abstract _doClearPermissions(): Promise<void>;
  abstract setGeolocation(geolocation?: types.Geolocation): Promise<void>;
  abstract _doSetHTTPCredentials(httpCredentials?: types.Credentials): Promise<void>;
  abstract setExtraHTTPHeaders(headers: types.HeadersArray): Promise<void>;
  abstract setOffline(offline: boolean): Promise<void>;
  abstract _doAddInitScript(expression: string): Promise<void>;
  abstract _doExposeBinding(binding: PageBinding): Promise<void>;
  abstract _doUpdateRequestInterception(): Promise<void>;
  abstract _doClose(): Promise<void>;

  async cookies(urls: string | string[] | undefined = []): Promise<types.NetworkCookie[]> {
    if (urls && !Array.isArray(urls))
      urls = [ urls ];
    return await this._doCookies(urls as string[]);
  }

  setHTTPCredentials(httpCredentials?: types.Credentials): Promise<void> {
    return this._doSetHTTPCredentials(httpCredentials);
  }

  async exposeBinding(name: string, needsHandle: boolean, playwrightBinding: frames.FunctionWithSource): Promise<void> {
    const identifier = PageBinding.identifier(name, 'main');
    if (this._pageBindings.has(identifier))
      throw new Error(`Function "${name}" has been already registered`);
    for (const page of this.pages()) {
      if (page.getBinding(name, 'main'))
        throw new Error(`Function "${name}" has been already registered in one of the pages`);
    }
    const binding = new PageBinding(name, playwrightBinding, needsHandle, 'main');
    this._pageBindings.set(identifier, binding);
    this._doExposeBinding(binding);
  }

  async grantPermissions(permissions: string[], origin?: string) {
    let resolvedOrigin = '*';
    if (origin) {
      const url = new URL(origin);
      resolvedOrigin = url.origin;
    }
    const existing = new Set(this._permissions.get(resolvedOrigin) || []);
    permissions.forEach(p => existing.add(p));
    const list = [...existing.values()];
    this._permissions.set(resolvedOrigin, list);
    await this._doGrantPermissions(resolvedOrigin, list);
  }

  async clearPermissions() {
    this._permissions.clear();
    await this._doClearPermissions();
  }

  setDefaultNavigationTimeout(timeout: number) {
    this._timeoutSettings.setDefaultNavigationTimeout(timeout);
  }

  setDefaultTimeout(timeout: number) {
    this._timeoutSettings.setDefaultTimeout(timeout);
  }

  async _loadDefaultContextAsIs(progress: Progress): Promise<Page[]> {
    if (!this.pages().length) {
      const waitForEvent = helper.waitForEvent(progress, this, BrowserContext.Events.Page);
      progress.cleanupWhenAborted(() => waitForEvent.dispose);
      await waitForEvent.promise;
    }
    const pages = this.pages();
    await pages[0].mainFrame()._waitForLoadState(progress, 'load');
    return pages;
  }

  async _loadDefaultContext(progress: Progress) {
    const pages = await this._loadDefaultContextAsIs(progress);
    if (pages.length !== 1 || pages[0].mainFrame().url() !== 'about:blank')
      throw new Error(`Arguments can not specify page to be opened (first url is ${pages[0].mainFrame().url()})`);
    if (this._options.isMobile || this._options.locale) {
      // Workaround for:
      // - chromium fails to change isMobile for existing page;
      // - webkit fails to change locale for existing page.
      const oldPage = pages[0];
      await this.newPage();
      await oldPage.close();
    }
  }

  protected _authenticateProxyViaHeader() {
    const proxy = this._options.proxy || this._browser._options.proxy || { username: undefined, password: undefined };
    const { username, password } = proxy;
    if (username) {
      this._options.httpCredentials = { username, password: password! };
      const token = Buffer.from(`${username}:${password}`).toString('base64');
      this._options.extraHTTPHeaders = network.mergeHeaders([
        this._options.extraHTTPHeaders,
        network.singleHeader('Proxy-Authorization', `Basic ${token}`),
      ]);
    }
  }

  protected _authenticateProxyViaCredentials() {
    const proxy = this._options.proxy || this._browser._options.proxy;
    if (!proxy)
      return;
    const { username, password } = proxy;
    if (username && password)
      this._options.httpCredentials = { username, password };
  }

  async _setRequestInterceptor(handler: network.RouteHandler | undefined): Promise<void> {
    this._requestInterceptor = handler;
    await this._doUpdateRequestInterception();
  }

  isClosingOrClosed() {
    return this._closedStatus !== 'open';
  }

  async close() {
    if (this._closedStatus === 'open') {
      this._closedStatus = 'closing';

      for (const listener of contextListeners)
        await listener.onContextWillDestroy(this);

      // Collect videos/downloads that we will await.
      const promises: Promise<any>[] = [];
      for (const download of this._downloads)
        promises.push(download.delete());
      for (const video of this._browser._idToVideo.values()) {
        if (video._context === this)
          promises.push(video._finishedPromise);
      }

      if (this._isPersistentContext) {
        // Close all the pages instead of the context,
        // because we cannot close the default context.
        await Promise.all(this.pages().map(page => page.close()));
      } else {
        // Close the context.
        await this._doClose();
      }

      // Wait for the videos/downloads to finish.
      await Promise.all(promises);

      // Persistent context should also close the browser.
      if (this._isPersistentContext)
        await this._browser.close();

      // Bookkeeping.
      for (const listener of contextListeners)
        await listener.onContextDidDestroy(this);
      this._didCloseInternal();
    }
    await this._closePromise;
  }

  async newPage(): Promise<Page> {
    const pageDelegate = await this.newPageDelegate();
    const pageOrError = await pageDelegate.pageOrError();
    if (pageOrError instanceof Page) {
      if (pageOrError.isClosed())
        throw new Error('Page has been closed.');
      return pageOrError;
    }
    throw pageOrError;
  }

  addVisitedOrigin(origin: string) {
    this._origins.add(origin);
  }

  async storageState(): Promise<types.StorageState> {
    const result: types.StorageState = {
      cookies: (await this.cookies()).filter(c => c.value !== ''),
      origins: []
    };
    if (this._origins.size)  {
      const page = await this.newPage();
      await page._setServerRequestInterceptor(handler => {
        handler.fulfill({ body: '<html></html>' }).catch(() => {});
      });
      for (const origin of this._origins) {
        const originStorage: types.OriginStorage = { origin, localStorage: [] };
        result.origins.push(originStorage);
        const frame = page.mainFrame();
        await frame.goto(new ProgressController(), origin);
        const storage = await frame._evaluateExpression(`({
          localStorage: Object.keys(localStorage).map(name => ({ name, value: localStorage.getItem(name) })),
        })`, false, undefined, 'utility');
        originStorage.localStorage = storage.localStorage;
      }
      await page.close();
    }
    return result;
  }

  async setStorageState(state: types.SetStorageState) {
    if (state.cookies)
      await this.addCookies(state.cookies);
    if (state.origins && state.origins.length)  {
      const page = await this.newPage();
      await page._setServerRequestInterceptor(handler => {
        handler.fulfill({ body: '<html></html>' }).catch(() => {});
      });
      for (const originState of state.origins) {
        const frame = page.mainFrame();
        await frame.goto(new ProgressController(), originState.origin);
        await frame._evaluateExpression(`
          originState => {
            for (const { name, value } of (originState.localStorage || []))
              localStorage.setItem(name, value);
          }`, true, originState, 'utility');
      }
      await page.close();
    }
  }
}

export function assertBrowserContextIsNotOwned(context: BrowserContext) {
  for (const page of context.pages()) {
    if (page._ownedContext)
      throw new Error('Please use browser.newContext() for multi-page scripts that share the context.');
  }
}

export function validateBrowserContextOptions(options: types.BrowserContextOptions, browserOptions: BrowserOptions) {
  if (options.noDefaultViewport && options.deviceScaleFactor !== undefined)
    throw new Error(`"deviceScaleFactor" option is not supported with null "viewport"`);
  if (options.noDefaultViewport && options.isMobile !== undefined)
    throw new Error(`"isMobile" option is not supported with null "viewport"`);
  if (!options.viewport && !options.noDefaultViewport)
    options.viewport = { width: 1280, height: 720 };
  if (options.proxy) {
    if (!browserOptions.proxy)
      throw new Error(`Browser needs to be launched with the global proxy. If all contexts override the proxy, global proxy will be never used and can be any string, for example "launch({ proxy: { server: 'per-context' } })"`);
    options.proxy = normalizeProxySettings(options.proxy);
  }
  verifyGeolocation(options.geolocation);
}

export function verifyGeolocation(geolocation?: types.Geolocation) {
  if (!geolocation)
    return;
  geolocation.accuracy = geolocation.accuracy || 0;
  const { longitude, latitude, accuracy } = geolocation;
  if (longitude < -180 || longitude > 180)
    throw new Error(`geolocation.longitude: precondition -180 <= LONGITUDE <= 180 failed.`);
  if (latitude < -90 || latitude > 90)
    throw new Error(`geolocation.latitude: precondition -90 <= LATITUDE <= 90 failed.`);
  if (accuracy < 0)
    throw new Error(`geolocation.accuracy: precondition 0 <= ACCURACY failed.`);
}

export function normalizeProxySettings(proxy: types.ProxySettings): types.ProxySettings {
  let { server, bypass } = proxy;
  let url;
  try {
    // new URL('127.0.0.1:8080') throws
    // new URL('localhost:8080') fails to parse host or protocol
    // In both of these cases, we need to try re-parse URL with `http://` prefix.
    url = new URL(server);
    if (!url.host || !url.protocol)
      url = new URL('http://' + server);
  } catch (e) {
    url = new URL('http://' + server);
  }
  server = url.protocol + '//' + url.host;
  if (bypass)
    bypass = bypass.split(',').map(t => t.trim()).join(',');
  return { ...proxy, server, bypass };
}
