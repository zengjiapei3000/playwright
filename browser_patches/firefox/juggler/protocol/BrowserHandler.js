/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {AddonManager} = ChromeUtils.import("resource://gre/modules/AddonManager.jsm");
const {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
const {TargetRegistry} = ChromeUtils.import("chrome://juggler/content/TargetRegistry.js");
const {Helper} = ChromeUtils.import('chrome://juggler/content/Helper.js');
const {PageHandler} = ChromeUtils.import("chrome://juggler/content/protocol/PageHandler.js");
const {AppConstants} = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");

const helper = new Helper();

class BrowserHandler {
  constructor(session, dispatcher, targetRegistry, onclose) {
    this._session = session;
    this._dispatcher = dispatcher;
    this._targetRegistry = targetRegistry;
    this._enabled = false;
    this._attachToDefaultContext = false;
    this._eventListeners = [];
    this._createdBrowserContextIds = new Set();
    this._attachedSessions = new Map();
    this._onclose = onclose;
  }

  async ['Browser.enable']({attachToDefaultContext}) {
    if (this._enabled)
      return;
    this._enabled = true;
    this._attachToDefaultContext = attachToDefaultContext;

    this._eventListeners = [
      helper.on(this._targetRegistry, TargetRegistry.Events.TargetCreated, this._onTargetCreated.bind(this)),
      helper.on(this._targetRegistry, TargetRegistry.Events.TargetDestroyed, this._onTargetDestroyed.bind(this)),
      helper.on(this._targetRegistry, TargetRegistry.Events.DownloadCreated, this._onDownloadCreated.bind(this)),
      helper.on(this._targetRegistry, TargetRegistry.Events.DownloadFinished, this._onDownloadFinished.bind(this)),
    ];

    const onScreencastStopped = (subject, topic, data) => {
      this._session.emitEvent('Browser.screencastFinished', {screencastId: '' + data});
    };
    Services.obs.addObserver(onScreencastStopped, 'juggler-screencast-stopped');
    this._eventListeners.push(() => Services.obs.removeObserver(onScreencastStopped, 'juggler-screencast-stopped'));

    for (const target of this._targetRegistry.targets())
      this._onTargetCreated(target);

    // Wait to complete initialization of addon manager and search
    // service before returning from this method. Failing to do so will result
    // in a broken shutdown sequence and multiple errors in browser STDERR log.
    //
    // NOTE: we have to put this here as well as in the `Browser.close` handler
    // since browser shutdown can be initiated when the last tab is closed, e.g.
    // with persistent context.
    await Promise.all([
      waitForAddonManager(),
      waitForSearchService(),
    ]);
  }

  async ['Browser.createBrowserContext']({removeOnDetach}) {
    if (!this._enabled)
      throw new Error('Browser domain is not enabled');
    const browserContext = this._targetRegistry.createBrowserContext(removeOnDetach);
    this._createdBrowserContextIds.add(browserContext.browserContextId);
    return {browserContextId: browserContext.browserContextId};
  }

  async ['Browser.removeBrowserContext']({browserContextId}) {
    if (!this._enabled)
      throw new Error('Browser domain is not enabled');
    await this._targetRegistry.browserContextForId(browserContextId).destroy();
    this._createdBrowserContextIds.delete(browserContextId);
  }

  dispose() {
    helper.removeListeners(this._eventListeners);
    for (const [target, session] of this._attachedSessions)
      this._dispatcher.destroySession(session);
    this._attachedSessions.clear();
    for (const browserContextId of this._createdBrowserContextIds) {
      const browserContext = this._targetRegistry.browserContextForId(browserContextId);
      if (browserContext.removeOnDetach)
        browserContext.destroy();
    }
    this._createdBrowserContextIds.clear();
  }

  _shouldAttachToTarget(target) {
    if (this._createdBrowserContextIds.has(target._browserContext.browserContextId))
      return true;
    return this._attachToDefaultContext && target._browserContext === this._targetRegistry.defaultContext();
  }

  _onTargetCreated(target) {
    if (!this._shouldAttachToTarget(target))
      return;
    const channel = target.channel();
    const session = this._dispatcher.createSession();
    this._attachedSessions.set(target, session);
    this._session.emitEvent('Browser.attachedToTarget', {
      sessionId: session.sessionId(),
      targetInfo: target.info()
    });
    session.setHandler(new PageHandler(target, session, channel));
  }

  _onTargetDestroyed(target) {
    const session = this._attachedSessions.get(target);
    if (!session)
      return;
    this._attachedSessions.delete(target);
    this._dispatcher.destroySession(session);
    this._session.emitEvent('Browser.detachedFromTarget', {
      sessionId: session.sessionId(),
      targetId: target.id(),
    });
  }

  _onDownloadCreated(downloadInfo) {
    this._session.emitEvent('Browser.downloadCreated', downloadInfo);
  }

  _onDownloadFinished(downloadInfo) {
    this._session.emitEvent('Browser.downloadFinished', downloadInfo);
  }

  async ['Browser.newPage']({browserContextId}) {
    const targetId = await this._targetRegistry.newPage({browserContextId});
    return {targetId};
  }

  async ['Browser.close']() {
    let browserWindow = Services.wm.getMostRecentWindow(
      "navigator:browser"
    );
    if (browserWindow && browserWindow.gBrowserInit) {
      await browserWindow.gBrowserInit.idleTasksFinishedPromise;
    }
    // Try to fully initialize browser before closing.
    // See comment in `Browser.enable`.
    await Promise.all([
      waitForAddonManager(),
      waitForSearchService(),
    ]);
    this._onclose();
    Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
  }

  async ['Browser.grantPermissions']({browserContextId, origin, permissions}) {
    await this._targetRegistry.browserContextForId(browserContextId).grantPermissions(origin, permissions);
  }

  async ['Browser.resetPermissions']({browserContextId}) {
    this._targetRegistry.browserContextForId(browserContextId).resetPermissions();
  }

  ['Browser.setExtraHTTPHeaders']({browserContextId, headers}) {
    this._targetRegistry.browserContextForId(browserContextId).extraHTTPHeaders = headers;
  }

  ['Browser.setHTTPCredentials']({browserContextId, credentials}) {
    this._targetRegistry.browserContextForId(browserContextId).httpCredentials = nullToUndefined(credentials);
  }

  async ['Browser.setBrowserProxy']({type, host, port, bypass, username, password}) {
    this._targetRegistry.setBrowserProxy({ type, host, port, bypass, username, password});
  }

  async ['Browser.setContextProxy']({browserContextId, type, host, port, bypass, username, password}) {
    const browserContext = this._targetRegistry.browserContextForId(browserContextId);
    browserContext.setProxy({ type, host, port, bypass, username, password });
  }

  ['Browser.setRequestInterception']({browserContextId, enabled}) {
    this._targetRegistry.browserContextForId(browserContextId).requestInterceptionEnabled = enabled;
  }

  ['Browser.setIgnoreHTTPSErrors']({browserContextId, ignoreHTTPSErrors}) {
    this._targetRegistry.browserContextForId(browserContextId).setIgnoreHTTPSErrors(nullToUndefined(ignoreHTTPSErrors));
  }

  ['Browser.setDownloadOptions']({browserContextId, downloadOptions}) {
    this._targetRegistry.browserContextForId(browserContextId).downloadOptions = nullToUndefined(downloadOptions);
  }

  async ['Browser.setGeolocationOverride']({browserContextId, geolocation}) {
    await this._targetRegistry.browserContextForId(browserContextId).applySetting('geolocation', nullToUndefined(geolocation));
  }

  async ['Browser.setOnlineOverride']({browserContextId, override}) {
    await this._targetRegistry.browserContextForId(browserContextId).applySetting('onlineOverride', nullToUndefined(override));
  }

  async ['Browser.setColorScheme']({browserContextId, colorScheme}) {
    await this._targetRegistry.browserContextForId(browserContextId).applySetting('colorScheme', nullToUndefined(colorScheme));
  }

  async ['Browser.setScreencastOptions']({browserContextId, dir, width, height, scale}) {
    await this._targetRegistry.browserContextForId(browserContextId).setScreencastOptions({dir, width, height, scale});
  }

  async ['Browser.setUserAgentOverride']({browserContextId, userAgent}) {
    await this._targetRegistry.browserContextForId(browserContextId).setDefaultUserAgent(userAgent);
  }

  async ['Browser.setBypassCSP']({browserContextId, bypassCSP}) {
    await this._targetRegistry.browserContextForId(browserContextId).applySetting('bypassCSP', nullToUndefined(bypassCSP));
  }

  async ['Browser.setJavaScriptDisabled']({browserContextId, javaScriptDisabled}) {
    await this._targetRegistry.browserContextForId(browserContextId).applySetting('javaScriptDisabled', nullToUndefined(javaScriptDisabled));
  }

  async ['Browser.setLocaleOverride']({browserContextId, locale}) {
    await this._targetRegistry.browserContextForId(browserContextId).applySetting('locale', nullToUndefined(locale));
  }

  async ['Browser.setTimezoneOverride']({browserContextId, timezoneId}) {
    await this._targetRegistry.browserContextForId(browserContextId).applySetting('timezoneId', nullToUndefined(timezoneId));
  }

  async ['Browser.setTouchOverride']({browserContextId, hasTouch}) {
    await this._targetRegistry.browserContextForId(browserContextId).setTouchOverride(nullToUndefined(hasTouch));
  }

  async ['Browser.setDefaultViewport']({browserContextId, viewport}) {
    await this._targetRegistry.browserContextForId(browserContextId).setDefaultViewport(nullToUndefined(viewport));
  }

  async ['Browser.addScriptToEvaluateOnNewDocument']({browserContextId, script}) {
    await this._targetRegistry.browserContextForId(browserContextId).addScriptToEvaluateOnNewDocument(script);
  }

  async ['Browser.addBinding']({browserContextId, name, script}) {
    await this._targetRegistry.browserContextForId(browserContextId).addBinding(name, script);
  }

  ['Browser.setCookies']({browserContextId, cookies}) {
    this._targetRegistry.browserContextForId(browserContextId).setCookies(cookies);
  }

  ['Browser.clearCookies']({browserContextId}) {
    this._targetRegistry.browserContextForId(browserContextId).clearCookies();
  }

  ['Browser.getCookies']({browserContextId}) {
    const cookies = this._targetRegistry.browserContextForId(browserContextId).getCookies();
    return {cookies};
  }

  async ['Browser.getInfo']() {
    const version = AppConstants.MOZ_APP_VERSION_DISPLAY;
    const userAgent = Components.classes["@mozilla.org/network/protocol;1?name=http"]
                                .getService(Components.interfaces.nsIHttpProtocolHandler)
                                .userAgent;
    return {version: 'Firefox/' + version, userAgent};
  }
}

async function waitForSearchService() {
  const searchService = Components.classes["@mozilla.org/browser/search-service;1"].getService(Components.interfaces.nsISearchService);
  await searchService.init();
}

async function waitForAddonManager() {
  if (AddonManager.isReady)
    return;
  await new Promise(resolve => {
    let listener = {
      onStartup() {
        AddonManager.removeManagerListener(listener);
        resolve();
      },
      onShutdown() { },
    };
    AddonManager.addManagerListener(listener);
  });
}

function nullToUndefined(value) {
  return value === null ? undefined : value;
}

var EXPORTED_SYMBOLS = ['BrowserHandler'];
this.BrowserHandler = BrowserHandler;
