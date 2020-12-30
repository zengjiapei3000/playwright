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

import { CRSession } from './crConnection';
import { Protocol } from './protocol';
import * as fs from 'fs';
import * as util from 'util';
import * as types from '../types';
import { mkdirIfNeeded } from '../../utils/utils';

export function getExceptionMessage(exceptionDetails: Protocol.Runtime.ExceptionDetails): string {
  if (exceptionDetails.exception)
    return exceptionDetails.exception.description || String(exceptionDetails.exception.value);
  let message = exceptionDetails.text;
  if (exceptionDetails.stackTrace) {
    for (const callframe of exceptionDetails.stackTrace.callFrames) {
      const location = callframe.url + ':' + callframe.lineNumber + ':' + callframe.columnNumber;
      const functionName = callframe.functionName || '<anonymous>';
      message += `\n    at ${functionName} (${location})`;
    }
  }
  return message;
}

export async function releaseObject(client: CRSession, objectId: string) {
  await client.send('Runtime.releaseObject', { objectId }).catch(error => {});
}

export async function readProtocolStream(client: CRSession, handle: string, path: string | null): Promise<Buffer> {
  let eof = false;
  let fd: number | undefined;
  if (path) {
    await mkdirIfNeeded(path);
    fd = await util.promisify(fs.open)(path, 'w');
  }
  const bufs = [];
  while (!eof) {
    const response = await client.send('IO.read', {handle});
    eof = response.eof;
    const buf = Buffer.from(response.data, response.base64Encoded ? 'base64' : undefined);
    bufs.push(buf);
    if (path)
      await util.promisify(fs.write)(fd!, buf);
  }
  if (path)
    await util.promisify(fs.close)(fd!);
  await client.send('IO.close', {handle});
  return Buffer.concat(bufs);
}

export function toConsoleMessageLocation(stackTrace: Protocol.Runtime.StackTrace | undefined): types.ConsoleMessageLocation {
  return stackTrace && stackTrace.callFrames.length ? {
    url: stackTrace.callFrames[0].url,
    lineNumber: stackTrace.callFrames[0].lineNumber,
    columnNumber: stackTrace.callFrames[0].columnNumber,
  } : { url: '', lineNumber: 0, columnNumber: 0 };
}

export function exceptionToError(exceptionDetails: Protocol.Runtime.ExceptionDetails): Error {
  const messageWithStack = getExceptionMessage(exceptionDetails);
  const lines = messageWithStack.split('\n');
  const firstStackTraceLine = lines.findIndex(line => line.startsWith('    at'));
  let message = '';
  let stack = '';
  if (firstStackTraceLine === -1) {
    message = messageWithStack;
  } else {
    message = lines.slice(0, firstStackTraceLine).join('\n');
    stack = messageWithStack;
  }
  const match = message.match(/^[a-zA-Z0-0_]*Error: (.*)$/);
  if (match)
    message = match[1];
  const err = new Error(message);
  err.stack = stack;
  return err;
}
