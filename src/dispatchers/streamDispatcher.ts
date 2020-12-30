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
import { Dispatcher, DispatcherScope } from './dispatcher';
import * as stream from 'stream';

export class StreamDispatcher extends Dispatcher<stream.Readable, channels.StreamInitializer> implements channels.StreamChannel {
  constructor(scope: DispatcherScope, stream: stream.Readable) {
    super(scope, stream, 'Stream', {});
  }

  async read(params: channels.StreamReadParams): Promise<channels.StreamReadResult> {
    const buffer = this._object.read(Math.min(this._object.readableLength, params.size || this._object.readableLength));
    return { binary: buffer ? buffer.toString('base64') : '' };
  }

  async close() {
    this._object.destroy();
  }
}
