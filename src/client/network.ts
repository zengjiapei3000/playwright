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

import { URLSearchParams } from 'url';
import * as channels from '../protocol/channels';
import { ChannelOwner } from './channelOwner';
import { Frame } from './frame';
import { Headers, WaitForEventOptions } from './types';
import * as fs from 'fs';
import * as mime from 'mime';
import * as util from 'util';
import { isString, headersObjectToArray, headersArrayToObject } from '../utils/utils';
import { Events } from './events';
import { Page } from './page';
import { Waiter } from './waiter';

export type NetworkCookie = {
  name: string,
  value: string,
  domain: string,
  path: string,
  expires: number,
  httpOnly: boolean,
  secure: boolean,
  sameSite: 'Strict' | 'Lax' | 'None'
};

export type SetNetworkCookieParam = {
  name: string,
  value: string,
  url?: string,
  domain?: string,
  path?: string,
  expires?: number,
  httpOnly?: boolean,
  secure?: boolean,
  sameSite?: 'Strict' | 'Lax' | 'None'
};

export class Request extends ChannelOwner<channels.RequestChannel, channels.RequestInitializer> {
  private _redirectedFrom: Request | null = null;
  private _redirectedTo: Request | null = null;
  _failureText: string | null = null;
  _headers: Headers;
  private _postData: Buffer | null;
  _timing: ResourceTiming;

  static from(request: channels.RequestChannel): Request {
    return (request as any)._object;
  }

  static fromNullable(request: channels.RequestChannel | undefined): Request | null {
    return request ? Request.from(request) : null;
  }

  constructor(parent: ChannelOwner, type: string, guid: string, initializer: channels.RequestInitializer) {
    super(parent, type, guid, initializer);
    this._redirectedFrom = Request.fromNullable(initializer.redirectedFrom);
    if (this._redirectedFrom)
      this._redirectedFrom._redirectedTo = this;
    this._headers = headersArrayToObject(initializer.headers, true /* lowerCase */);
    this._postData = initializer.postData ? Buffer.from(initializer.postData, 'base64') : null;
    this._timing = {
      startTime: 0,
      domainLookupStart: -1,
      domainLookupEnd: -1,
      connectStart: -1,
      secureConnectionStart: -1,
      connectEnd: -1,
      requestStart: -1,
      responseStart: -1,
      responseEnd: -1,
    };
  }

  url(): string {
    return this._initializer.url;
  }

  resourceType(): string {
    return this._initializer.resourceType;
  }

  method(): string {
    return this._initializer.method;
  }

  postData(): string | null {
    return this._postData ? this._postData.toString('utf8') : null;
  }

  postDataBuffer(): Buffer | null {
    return this._postData;
  }

  postDataJSON(): Object | null {
    const postData = this.postData();
    if (!postData)
      return null;

    const contentType = this.headers()['content-type'];
    if (!contentType)
      return null;

    if (contentType === 'application/x-www-form-urlencoded') {
      const entries: Record<string, string> = {};
      const parsed = new URLSearchParams(postData);
      for (const [k, v] of parsed.entries())
        entries[k] = v;
      return entries;
    }

    return JSON.parse(postData);
  }

  headers(): Headers {
    return { ...this._headers };
  }

  async response(): Promise<Response | null> {
    return Response.fromNullable((await this._channel.response()).response);
  }

  frame(): Frame {
    return Frame.from(this._initializer.frame);
  }

  isNavigationRequest(): boolean {
    return this._initializer.isNavigationRequest;
  }

  redirectedFrom(): Request | null {
    return this._redirectedFrom;
  }

  redirectedTo(): Request | null {
    return this._redirectedTo;
  }

  failure(): { errorText: string; } | null {
    if (this._failureText === null)
      return null;
    return {
      errorText: this._failureText
    };
  }

  timing(): ResourceTiming {
    return this._timing;
  }

  _finalRequest(): Request {
    return this._redirectedTo ? this._redirectedTo._finalRequest() : this;
  }
}

export class Route extends ChannelOwner<channels.RouteChannel, channels.RouteInitializer> {
  static from(route: channels.RouteChannel): Route {
    return (route as any)._object;
  }

  constructor(parent: ChannelOwner, type: string, guid: string, initializer: channels.RouteInitializer) {
    super(parent, type, guid, initializer);
  }

  request(): Request {
    return Request.from(this._initializer.request);
  }

  async abort(errorCode?: string) {
    await this._channel.abort({ errorCode });
  }

  async fulfill(response: { status?: number, headers?: Headers, contentType?: string, body?: string | Buffer, path?: string }) {
    let body = '';
    let isBase64 = false;
    let length = 0;
    if (response.path) {
      const buffer = await util.promisify(fs.readFile)(response.path);
      body = buffer.toString('base64');
      isBase64 = true;
      length = buffer.length;
    } else if (isString(response.body)) {
      body = response.body;
      isBase64 = false;
      length = Buffer.byteLength(body);
    } else if (response.body) {
      body = response.body.toString('base64');
      isBase64 = true;
      length = response.body.length;
    }

    const headers: Headers = {};
    for (const header of Object.keys(response.headers || {}))
      headers[header.toLowerCase()] = String(response.headers![header]);
    if (response.contentType)
      headers['content-type'] = String(response.contentType);
    else if (response.path)
      headers['content-type'] = mime.getType(response.path) || 'application/octet-stream';
    if (length && !('content-length' in headers))
      headers['content-length'] = String(length);

    await this._channel.fulfill({
      status: response.status || 200,
      headers: headersObjectToArray(headers),
      body,
      isBase64
    });
  }

  async continue(overrides: { url?: string, method?: string, headers?: Headers, postData?: string | Buffer } = {}) {
    const postDataBuffer = isString(overrides.postData) ? Buffer.from(overrides.postData, 'utf8') : overrides.postData;
    await this._channel.continue({
      url: overrides.url,
      method: overrides.method,
      headers: overrides.headers ? headersObjectToArray(overrides.headers) : undefined,
      postData: postDataBuffer ? postDataBuffer.toString('base64') : undefined,
    });
  }
}

export type RouteHandler = (route: Route, request: Request) => void;

export type ResourceTiming = {
  startTime: number;
  domainLookupStart: number;
  domainLookupEnd: number;
  connectStart: number;
  secureConnectionStart: number;
  connectEnd: number;
  requestStart: number;
  responseStart: number;
  responseEnd: number;
};

export class Response extends ChannelOwner<channels.ResponseChannel, channels.ResponseInitializer> {
  private _headers: Headers;
  private _request: Request;

  static from(response: channels.ResponseChannel): Response {
    return (response as any)._object;
  }

  static fromNullable(response: channels.ResponseChannel | undefined): Response | null {
    return response ? Response.from(response) : null;
  }

  constructor(parent: ChannelOwner, type: string, guid: string, initializer: channels.ResponseInitializer) {
    super(parent, type, guid, initializer);
    this._headers = headersArrayToObject(initializer.headers, true /* lowerCase */);
    this._request = Request.from(this._initializer.request);
    this._request._headers = headersArrayToObject(initializer.requestHeaders, true /* lowerCase */);
    Object.assign(this._request._timing, this._initializer.timing);
  }

  url(): string {
    return this._initializer.url;
  }

  ok(): boolean {
    return this._initializer.status === 0 || (this._initializer.status >= 200 && this._initializer.status <= 299);
  }

  status(): number {
    return this._initializer.status;
  }

  statusText(): string {
    return this._initializer.statusText;
  }

  headers(): Headers {
    return { ...this._headers };
  }

  async finished(): Promise<Error | null> {
    const result = await this._channel.finished();
    if (result.error)
      return new Error(result.error);
    return null;
  }

  async body(): Promise<Buffer> {
    return Buffer.from((await this._channel.body()).binary, 'base64');
  }

  async text(): Promise<string> {
    const content = await this.body();
    return content.toString('utf8');
  }

  async json(): Promise<object> {
    const content = await this.text();
    return JSON.parse(content);
  }

  request(): Request {
    return this._request;
  }

  frame(): Frame {
    return this._request.frame();
  }
}

export class WebSocket extends ChannelOwner<channels.WebSocketChannel, channels.WebSocketInitializer> {
  private _page: Page;
  private _isClosed: boolean;

  static from(webSocket: channels.WebSocketChannel): WebSocket {
    return (webSocket as any)._object;
  }

  constructor(parent: ChannelOwner, type: string, guid: string, initializer: channels.WebSocketInitializer) {
    super(parent, type, guid, initializer);
    this._isClosed = false;
    this._page = parent as Page;
    this._channel.on('frameSent', (event: { opcode: number, data: string }) => {
      const payload = event.opcode === 2 ? Buffer.from(event.data, 'base64') : event.data;
      this.emit(Events.WebSocket.FrameSent, { payload });
    });
    this._channel.on('frameReceived', (event: { opcode: number, data: string }) => {
      const payload = event.opcode === 2 ? Buffer.from(event.data, 'base64') : event.data;
      this.emit(Events.WebSocket.FrameReceived, { payload });
    });
    this._channel.on('socketError', ({ error }) => this.emit(Events.WebSocket.Error, error));
    this._channel.on('close', () => {
      this._isClosed = true;
      this.emit(Events.WebSocket.Close);
    });
  }

  url(): string {
    return this._initializer.url;
  }

  isClosed(): boolean {
    return this._isClosed;
  }

  async waitForEvent(event: string, optionsOrPredicate: WaitForEventOptions = {}): Promise<any> {
    const timeout = this._page._timeoutSettings.timeout(typeof optionsOrPredicate === 'function' ? {} : optionsOrPredicate);
    const predicate = typeof optionsOrPredicate === 'function' ? optionsOrPredicate : optionsOrPredicate.predicate;
    const waiter = new Waiter();
    waiter.rejectOnTimeout(timeout, `Timeout while waiting for event "${event}"`);
    if (event !== Events.WebSocket.Error)
      waiter.rejectOnEvent(this, Events.WebSocket.Error, new Error('Socket error'));
    if (event !== Events.WebSocket.Close)
      waiter.rejectOnEvent(this, Events.WebSocket.Close, new Error('Socket closed'));
    waiter.rejectOnEvent(this._page, Events.Page.Close, new Error('Page closed'));
    const result = await waiter.waitForEvent(this, event, predicate as any);
    waiter.dispose();
    return result;
  }
}

export function validateHeaders(headers: Headers) {
  for (const key of Object.keys(headers)) {
    const value = headers[key];
    if (!Object.is(value, undefined) && !isString(value))
      throw new Error(`Expected value of header "${key}" to be String, but "${typeof value}" is found.`);
  }
}
