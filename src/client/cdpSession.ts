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

import * as channels from '../protocol/channels';
import { ChannelOwner } from './channelOwner';
import { Protocol } from '../server/chromium/protocol';

export class CDPSession extends ChannelOwner<channels.CDPSessionChannel, channels.CDPSessionInitializer> {
  static from(cdpSession: channels.CDPSessionChannel): CDPSession {
    return (cdpSession as any)._object;
  }

  on: <T extends keyof Protocol.Events | symbol>(event: T, listener: (payload: T extends symbol ? any : Protocol.Events[T extends keyof Protocol.Events ? T : never]) => void) => this;
  addListener: <T extends keyof Protocol.Events | symbol>(event: T, listener: (payload: T extends symbol ? any : Protocol.Events[T extends keyof Protocol.Events ? T : never]) => void) => this;
  off: <T extends keyof Protocol.Events | symbol>(event: T, listener: (payload: T extends symbol ? any : Protocol.Events[T extends keyof Protocol.Events ? T : never]) => void) => this;
  removeListener: <T extends keyof Protocol.Events | symbol>(event: T, listener: (payload: T extends symbol ? any : Protocol.Events[T extends keyof Protocol.Events ? T : never]) => void) => this;
  once: <T extends keyof Protocol.Events | symbol>(event: T, listener: (payload: T extends symbol ? any : Protocol.Events[T extends keyof Protocol.Events ? T : never]) => void) => this;

  constructor(parent: ChannelOwner, type: string, guid: string, initializer: channels.CDPSessionInitializer) {
    super(parent, type, guid, initializer);

    this._channel.on('event', ({ method, params }) => {
      this.emit(method, params);
    });

    this.on = super.on;
    this.addListener = super.addListener;
    this.off = super.removeListener;
    this.removeListener = super.removeListener;
    this.once = super.once;
  }

  async send<T extends keyof Protocol.CommandParameters>(
    method: T,
    params?: Protocol.CommandParameters[T]
  ): Promise<Protocol.CommandReturnValues[T]> {
    return this._wrapApiCall('cdpSession.send', async () => {
      const result = await this._channel.send({ method, params });
      return result.result as Protocol.CommandReturnValues[T];
    });
  }

  async detach() {
    return this._wrapApiCall('cdpSession.detach', async () => {
      return this._channel.detach();
    });
  }
}
