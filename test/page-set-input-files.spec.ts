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

import { it, expect } from './fixtures';

import path from 'path';
import fs from 'fs';
import formidable from 'formidable';

const FILE_TO_UPLOAD = path.join(__dirname, '/assets/file-to-upload.txt');

it('should upload the file', async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/fileupload.html');
  const filePath = path.relative(process.cwd(), FILE_TO_UPLOAD);
  const input = await page.$('input');
  await input.setInputFiles(filePath);
  expect(await page.evaluate(e => e.files[0].name, input)).toBe('file-to-upload.txt');
  expect(await page.evaluate(e => {
    const reader = new FileReader();
    const promise = new Promise(fulfill => reader.onload = fulfill);
    reader.readAsText(e.files[0]);
    return promise.then(() => reader.result);
  }, input)).toBe('contents of the file');
});

it('should work', async ({page}) => {
  await page.setContent(`<input type=file>`);
  await page.setInputFiles('input', path.join(__dirname, '/assets/file-to-upload.txt'));
  expect(await page.$eval('input', input => input.files.length)).toBe(1);
  expect(await page.$eval('input', input => input.files[0].name)).toBe('file-to-upload.txt');
});

it('should set from memory', async ({page}) => {
  await page.setContent(`<input type=file>`);
  await page.setInputFiles('input', {
    name: 'test.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('this is a test')
  });
  expect(await page.$eval('input', input => input.files.length)).toBe(1);
  expect(await page.$eval('input', input => input.files[0].name)).toBe('test.txt');
});

it('should emit event once', async ({page, server}) => {
  await page.setContent(`<input type=file>`);
  const [chooser] = await Promise.all([
    new Promise(f => page.once('filechooser', f)),
    page.click('input'),
  ]);
  expect(chooser).toBeTruthy();
});

it('should emit event on/off', async ({page, server}) => {
  await page.setContent(`<input type=file>`);
  const [chooser] = await Promise.all([
    new Promise(f => {
      const listener = chooser => {
        page.off('filechooser', listener);
        f(chooser);
      };
      page.on('filechooser', listener);
    }),
    page.click('input'),
  ]);
  expect(chooser).toBeTruthy();
});

it('should emit event addListener/removeListener', async ({page, server}) => {
  await page.setContent(`<input type=file>`);
  const [chooser] = await Promise.all([
    new Promise(f => {
      const listener = chooser => {
        page.removeListener('filechooser', listener);
        f(chooser);
      };
      page.addListener('filechooser', listener);
    }),
    page.click('input'),
  ]);
  expect(chooser).toBeTruthy();
});

it('should work when file input is attached to DOM', async ({page, server}) => {
  await page.setContent(`<input type=file>`);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('input'),
  ]);
  expect(chooser).toBeTruthy();
});

it('should work when file input is not attached to DOM', async ({page, server}) => {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.evaluate(() => {
      const el = document.createElement('input');
      el.type = 'file';
      el.click();
    }),
  ]);
  expect(chooser).toBeTruthy();
});

it('should work with CSP', async ({page, server}) => {
  server.setCSP('/empty.html', 'default-src "none"');
  await page.goto(server.EMPTY_PAGE);
  await page.setContent(`<input type=file>`);
  await page.setInputFiles('input', path.join(__dirname, '/assets/file-to-upload.txt'));
  expect(await page.$eval('input', input => input.files.length)).toBe(1);
  expect(await page.$eval('input', input => input.files[0].name)).toBe('file-to-upload.txt');
});

it('should respect timeout', async ({page, playwright}) => {
  let error = null;
  await page.waitForEvent('filechooser', {timeout: 1}).catch(e => error = e);
  expect(error).toBeInstanceOf(playwright.errors.TimeoutError);
});

it('should respect default timeout when there is no custom timeout', async ({page, playwright}) => {
  page.setDefaultTimeout(1);
  let error = null;
  await page.waitForEvent('filechooser').catch(e => error = e);
  expect(error).toBeInstanceOf(playwright.errors.TimeoutError);
});

it('should prioritize exact timeout over default timeout', async ({page, playwright}) => {
  page.setDefaultTimeout(0);
  let error = null;
  await page.waitForEvent('filechooser', {timeout: 1}).catch(e => error = e);
  expect(error).toBeInstanceOf(playwright.errors.TimeoutError);
});

it('should work with no timeout', async ({page, server}) => {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', {timeout: 0}),
    page.evaluate(() => setTimeout(() => {
      const el = document.createElement('input');
      el.type = 'file';
      el.click();
    }, 50))
  ]);
  expect(chooser).toBeTruthy();
});

it('should return the same file chooser when there are many watchdogs simultaneously', async ({page, server}) => {
  await page.setContent(`<input type=file>`);
  const [fileChooser1, fileChooser2] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.waitForEvent('filechooser'),
    page.$eval('input', input => input.click()),
  ]);
  expect(fileChooser1 === fileChooser2).toBe(true);
});

it('should accept single file', async ({page, server}) => {
  await page.setContent(`<input type=file oninput='javascript:console.timeStamp()'>`);
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('input'),
  ]);
  expect(fileChooser.page()).toBe(page);
  expect(fileChooser.element()).toBeTruthy();
  await fileChooser.setFiles(FILE_TO_UPLOAD);
  expect(await page.$eval('input', input => input.files.length)).toBe(1);
  expect(await page.$eval('input', input => input.files[0].name)).toBe('file-to-upload.txt');
});

it('should detect mime type', async ({page, server}) => {
  let files;
  server.setRoute('/upload', async (req, res) => {
    const form = new formidable.IncomingForm();
    form.parse(req, function(err, fields, f) {
      files = f;
      res.end();
    });
  });
  await page.goto(server.EMPTY_PAGE);
  await page.setContent(`
    <form action="/upload" method="post" enctype="multipart/form-data" >
      <input type="file" name="file1">
      <input type="file" name="file2">
      <input type="submit" value="Submit">
    </form>`);
  await (await page.$('input[name=file1]')).setInputFiles(path.join(__dirname, '/assets/file-to-upload.txt'));
  await (await page.$('input[name=file2]')).setInputFiles(path.join(__dirname, '/assets/pptr.png'));
  await Promise.all([
    page.click('input[type=submit]'),
    server.waitForRequest('/upload'),
  ]);
  const { file1, file2 } = files;
  expect(file1.name).toBe('file-to-upload.txt');
  expect(file1.type).toBe('text/plain');
  expect(fs.readFileSync(file1.path).toString()).toBe(
      fs.readFileSync(path.join(__dirname, '/assets/file-to-upload.txt')).toString());
  expect(file2.name).toBe('pptr.png');
  expect(file2.type).toBe('image/png');
  expect(fs.readFileSync(file2.path).toString()).toBe(
      fs.readFileSync(path.join(__dirname, '/assets/pptr.png')).toString());
});

it('should be able to read selected file', async ({page, server}) => {
  await page.setContent(`<input type=file>`);
  const [, content] = await Promise.all([
    page.waitForEvent('filechooser').then(fileChooser => fileChooser.setFiles(FILE_TO_UPLOAD)),
    page.$eval('input', async picker => {
      picker.click();
      await new Promise(x => picker.oninput = x);
      const reader = new FileReader();
      const promise = new Promise(fulfill => reader.onload = fulfill);
      reader.readAsText(picker.files[0]);
      return promise.then(() => reader.result);
    }),
  ]);
  expect(content).toBe('contents of the file');
});

it('should be able to reset selected files with empty file list', async ({page, server}) => {
  await page.setContent(`<input type=file>`);
  const [, fileLength1] = await Promise.all([
    page.waitForEvent('filechooser').then(fileChooser => fileChooser.setFiles(FILE_TO_UPLOAD)),
    page.$eval('input', async picker => {
      picker.click();
      await new Promise(x => picker.oninput = x);
      return picker.files.length;
    }),
  ]);
  expect(fileLength1).toBe(1);
  const [, fileLength2] = await Promise.all([
    page.waitForEvent('filechooser').then(fileChooser => fileChooser.setFiles([])),
    page.$eval('input', async picker => {
      picker.click();
      await new Promise(x => picker.oninput = x);
      return picker.files.length;
    }),
  ]);
  expect(fileLength2).toBe(0);
});

it('should not accept multiple files for single-file input', async ({page, server}) => {
  await page.setContent(`<input type=file>`);
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('input'),
  ]);
  let error = null;
  await fileChooser.setFiles([
    path.relative(process.cwd(), __dirname + '/assets/file-to-upload.txt'),
    path.relative(process.cwd(), __dirname + '/assets/pptr.png')
  ]).catch(e => error = e);
  expect(error).not.toBe(null);
});

it('should emit input and change events', async ({page, server}) => {
  const events = [];
  await page.exposeFunction('eventHandled', e => events.push(e));
  await page.setContent(`
  <input id=input type=file></input>
  <script>
    input.addEventListener('input', e => eventHandled({ type: e.type }));
    input.addEventListener('change', e => eventHandled({ type: e.type }));
  </script>`);
  await (await page.$('input')).setInputFiles(FILE_TO_UPLOAD);
  expect(events.length).toBe(2);
  expect(events[0].type).toBe('input');
  expect(events[1].type).toBe('change');
});

it('should work for single file pick', async ({page, server}) => {
  await page.setContent(`<input type=file>`);
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('input'),
  ]);
  expect(fileChooser.isMultiple()).toBe(false);
});

it('should work for "multiple"', async ({page, server}) => {
  await page.setContent(`<input multiple type=file>`);
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('input'),
  ]);
  expect(fileChooser.isMultiple()).toBe(true);
});

it('should work for "webkitdirectory"', async ({page, server}) => {
  await page.setContent(`<input multiple webkitdirectory type=file>`);
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('input'),
  ]);
  expect(fileChooser.isMultiple()).toBe(true);
});
