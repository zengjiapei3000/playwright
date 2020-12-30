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
import { attachFrame } from './utils';

it('should type into a textarea', async ({page}) => {
  await page.evaluate(() => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();
  });
  const text = 'Hello world. I am the text that was typed!';
  await page.keyboard.type(text);
  expect(await page.evaluate(() => document.querySelector('textarea').value)).toBe(text);
});

it('should move with the arrow keys', async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/textarea.html');
  await page.type('textarea', 'Hello World!');
  expect(await page.evaluate(() => document.querySelector('textarea').value)).toBe('Hello World!');
  for (let i = 0; i < 'World!'.length; i++)
    await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('inserted ');
  expect(await page.evaluate(() => document.querySelector('textarea').value)).toBe('Hello inserted World!');
  await page.keyboard.down('Shift');
  for (let i = 0; i < 'inserted '.length; i++)
    await page.keyboard.press('ArrowLeft');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Backspace');
  expect(await page.evaluate(() => document.querySelector('textarea').value)).toBe('Hello World!');
});

it('should send a character with ElementHandle.press', async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/textarea.html');
  const textarea = await page.$('textarea');
  await textarea.press('a');
  expect(await page.evaluate(() => document.querySelector('textarea').value)).toBe('a');

  await page.evaluate(() => window.addEventListener('keydown', e => e.preventDefault(), true));

  await textarea.press('b');
  expect(await page.evaluate(() => document.querySelector('textarea').value)).toBe('a');
});

it('should send a character with insertText', async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/textarea.html');
  await page.focus('textarea');
  await page.keyboard.insertText('嗨');
  expect(await page.evaluate(() => document.querySelector('textarea').value)).toBe('嗨');
  await page.evaluate(() => window.addEventListener('keydown', e => e.preventDefault(), true));
  await page.keyboard.insertText('a');
  expect(await page.evaluate(() => document.querySelector('textarea').value)).toBe('嗨a');
});

it('insertText should only emit input event', async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/textarea.html');
  await page.focus('textarea');
  page.on('console', m => console.log(m.text()));
  const events = await page.evaluateHandle(() => {
    const events = [];
    document.addEventListener('keydown', e => events.push(e.type));
    document.addEventListener('keyup', e => events.push(e.type));
    document.addEventListener('keypress', e => events.push(e.type));
    document.addEventListener('input', e => events.push(e.type));
    return events;
  });
  await page.keyboard.insertText('hello world');
  expect(await events.jsonValue()).toEqual(['input']);
});

it('should report shiftKey', (test, { browserName, platform }) => {
  test.fail(browserName === 'firefox' && platform === 'darwin');
}, async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/keyboard.html');
  const keyboard = page.keyboard;
  const codeForKey = {'Shift': 16, 'Alt': 18, 'Control': 17};
  for (const modifierKey in codeForKey) {
    await keyboard.down(modifierKey);
    expect(await page.evaluate('getResult()')).toBe('Keydown: ' + modifierKey + ' ' + modifierKey + 'Left ' + codeForKey[modifierKey] + ' [' + modifierKey + ']');
    await keyboard.down('!');
    // Shift+! will generate a keypress
    if (modifierKey === 'Shift')
      expect(await page.evaluate('getResult()')).toBe('Keydown: ! Digit1 49 [' + modifierKey + ']\nKeypress: ! Digit1 33 33 [' + modifierKey + ']');
    else
      expect(await page.evaluate('getResult()')).toBe('Keydown: ! Digit1 49 [' + modifierKey + ']');

    await keyboard.up('!');
    expect(await page.evaluate('getResult()')).toBe('Keyup: ! Digit1 49 [' + modifierKey + ']');
    await keyboard.up(modifierKey);
    expect(await page.evaluate('getResult()')).toBe('Keyup: ' + modifierKey + ' ' + modifierKey + 'Left ' + codeForKey[modifierKey] + ' []');
  }
});

it('should report multiple modifiers', async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/keyboard.html');
  const keyboard = page.keyboard;
  await keyboard.down('Control');
  expect(await page.evaluate('getResult()')).toBe('Keydown: Control ControlLeft 17 [Control]');
  await keyboard.down('Alt');
  expect(await page.evaluate('getResult()')).toBe('Keydown: Alt AltLeft 18 [Alt Control]');
  await keyboard.down(';');
  expect(await page.evaluate('getResult()')).toBe('Keydown: ; Semicolon 186 [Alt Control]');
  await keyboard.up(';');
  expect(await page.evaluate('getResult()')).toBe('Keyup: ; Semicolon 186 [Alt Control]');
  await keyboard.up('Control');
  expect(await page.evaluate('getResult()')).toBe('Keyup: Control ControlLeft 17 [Alt]');
  await keyboard.up('Alt');
  expect(await page.evaluate('getResult()')).toBe('Keyup: Alt AltLeft 18 []');
});

it('should send proper codes while typing', async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/keyboard.html');
  await page.keyboard.type('!');
  expect(await page.evaluate('getResult()')).toBe(
      [ 'Keydown: ! Digit1 49 []',
        'Keypress: ! Digit1 33 33 []',
        'Keyup: ! Digit1 49 []'].join('\n'));
  await page.keyboard.type('^');
  expect(await page.evaluate('getResult()')).toBe(
      [ 'Keydown: ^ Digit6 54 []',
        'Keypress: ^ Digit6 94 94 []',
        'Keyup: ^ Digit6 54 []'].join('\n'));
});

it('should send proper codes while typing with shift', async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/keyboard.html');
  const keyboard = page.keyboard;
  await keyboard.down('Shift');
  await page.keyboard.type('~');
  expect(await page.evaluate('getResult()')).toBe(
      [ 'Keydown: Shift ShiftLeft 16 [Shift]',
        'Keydown: ~ Backquote 192 [Shift]', // 192 is ` keyCode
        'Keypress: ~ Backquote 126 126 [Shift]', // 126 is ~ charCode
        'Keyup: ~ Backquote 192 [Shift]'].join('\n'));
  await keyboard.up('Shift');
});

it('should not type canceled events', async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/textarea.html');
  await page.focus('textarea');
  await page.evaluate(() => {
    window.addEventListener('keydown', event => {
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.key === 'l')
        event.preventDefault();
      if (event.key === 'o')
        event.preventDefault();
    }, false);
  });
  await page.keyboard.type('Hello World!');
  expect(await page.$eval('textarea', textarea => textarea.value)).toBe('He Wrd!');
});

it('should press plus', async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/keyboard.html');
  await page.keyboard.press('+');
  expect(await page.evaluate('getResult()')).toBe(
      [ 'Keydown: + Equal 187 []', // 192 is ` keyCode
        'Keypress: + Equal 43 43 []', // 126 is ~ charCode
        'Keyup: + Equal 187 []'].join('\n'));
});

it('should press shift plus', async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/keyboard.html');
  await page.keyboard.press('Shift++');
  expect(await page.evaluate('getResult()')).toBe(
      [ 'Keydown: Shift ShiftLeft 16 [Shift]',
        'Keydown: + Equal 187 [Shift]', // 192 is ` keyCode
        'Keypress: + Equal 43 43 [Shift]', // 126 is ~ charCode
        'Keyup: + Equal 187 [Shift]',
        'Keyup: Shift ShiftLeft 16 []'].join('\n'));
});

it('should support plus-separated modifiers', async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/keyboard.html');
  await page.keyboard.press('Shift+~');
  expect(await page.evaluate('getResult()')).toBe(
      [ 'Keydown: Shift ShiftLeft 16 [Shift]',
        'Keydown: ~ Backquote 192 [Shift]', // 192 is ` keyCode
        'Keypress: ~ Backquote 126 126 [Shift]', // 126 is ~ charCode
        'Keyup: ~ Backquote 192 [Shift]',
        'Keyup: Shift ShiftLeft 16 []'].join('\n'));
});

it('should support multiple plus-separated modifiers', async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/keyboard.html');
  await page.keyboard.press('Control+Shift+~');
  expect(await page.evaluate('getResult()')).toBe(
      [ 'Keydown: Control ControlLeft 17 [Control]',
        'Keydown: Shift ShiftLeft 16 [Control Shift]',
        'Keydown: ~ Backquote 192 [Control Shift]', // 192 is ` keyCode
        'Keyup: ~ Backquote 192 [Control Shift]',
        'Keyup: Shift ShiftLeft 16 [Control]',
        'Keyup: Control ControlLeft 17 []'].join('\n'));
});

it('should shift raw codes', async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/keyboard.html');
  await page.keyboard.press('Shift+Digit3');
  expect(await page.evaluate('getResult()')).toBe(
      [ 'Keydown: Shift ShiftLeft 16 [Shift]',
        'Keydown: # Digit3 51 [Shift]', // 51 is # keyCode
        'Keypress: # Digit3 35 35 [Shift]', // 35 is # charCode
        'Keyup: # Digit3 51 [Shift]',
        'Keyup: Shift ShiftLeft 16 []'].join('\n'));
});

it('should specify repeat property', async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/textarea.html');
  await page.focus('textarea');
  const lastEvent = await captureLastKeydown(page);
  await page.keyboard.down('a');
  expect(await lastEvent.evaluate(e => e.repeat)).toBe(false);
  await page.keyboard.press('a');
  expect(await lastEvent.evaluate(e => e.repeat)).toBe(true);

  await page.keyboard.down('b');
  expect(await lastEvent.evaluate(e => e.repeat)).toBe(false);
  await page.keyboard.down('b');
  expect(await lastEvent.evaluate(e => e.repeat)).toBe(true);

  await page.keyboard.up('a');
  await page.keyboard.down('a');
  expect(await lastEvent.evaluate(e => e.repeat)).toBe(false);
});

it('should type all kinds of characters', async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/textarea.html');
  await page.focus('textarea');
  const text = 'This text goes onto two lines.\nThis character is 嗨.';
  await page.keyboard.type(text);
  expect(await page.$eval('textarea', t => t.value)).toBe(text);
});

it('should specify location', async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/textarea.html');
  const lastEvent = await captureLastKeydown(page);
  const textarea = await page.$('textarea');

  await textarea.press('Digit5');
  expect(await lastEvent.evaluate(e => e.location)).toBe(0);

  await textarea.press('ControlLeft');
  expect(await lastEvent.evaluate(e => e.location)).toBe(1);

  await textarea.press('ControlRight');
  expect(await lastEvent.evaluate(e => e.location)).toBe(2);

  await textarea.press('NumpadSubtract');
  expect(await lastEvent.evaluate(e => e.location)).toBe(3);
});

it('should press Enter', async ({page, server}) => {
  await page.setContent('<textarea></textarea>');
  await page.focus('textarea');
  const lastEventHandle = await captureLastKeydown(page);
  await testEnterKey('Enter', 'Enter', 'Enter');
  await testEnterKey('NumpadEnter', 'Enter', 'NumpadEnter');
  await testEnterKey('\n', 'Enter', 'Enter');
  await testEnterKey('\r', 'Enter', 'Enter');

  async function testEnterKey(key, expectedKey, expectedCode) {
    await page.keyboard.press(key);
    const lastEvent = await lastEventHandle.jsonValue();
    expect(lastEvent.key).toBe(expectedKey); // had the wrong key
    expect(lastEvent.code).toBe(expectedCode); // had the wrong code
    const value = await page.$eval('textarea', t => t.value);
    expect(value).toBe('\n'); // failed to create a newline
    await page.$eval('textarea', t => t.value = '');
  }
});

it('should throw on unknown keys', async ({page, server}) => {
  let error = await page.keyboard.press('NotARealKey').catch(e => e);
  expect(error.message).toBe('Unknown key: "NotARealKey"');

  error = await page.keyboard.press('ё').catch(e => e);
  expect(error && error.message).toBe('Unknown key: "ё"');

  error = await page.keyboard.press('😊').catch(e => e);
  expect(error && error.message).toBe('Unknown key: "😊"');
});

it('should type emoji', async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/textarea.html');
  await page.type('textarea', '👹 Tokyo street Japan 🇯🇵');
  expect(await page.$eval('textarea', textarea => textarea.value)).toBe('👹 Tokyo street Japan 🇯🇵');
});

it('should type emoji into an iframe', async ({page, server}) => {
  await page.goto(server.EMPTY_PAGE);
  await attachFrame(page, 'emoji-test', server.PREFIX + '/input/textarea.html');
  const frame = page.frames()[1];
  const textarea = await frame.$('textarea');
  await textarea.type('👹 Tokyo street Japan 🇯🇵');
  expect(await frame.$eval('textarea', textarea => textarea.value)).toBe('👹 Tokyo street Japan 🇯🇵');
});

it('should handle selectAll', async ({page, server, isMac}) => {
  await page.goto(server.PREFIX + '/input/textarea.html');
  const textarea = await page.$('textarea');
  await textarea.type('some text');
  const modifier = isMac ? 'Meta' : 'Control';
  await page.keyboard.down(modifier);
  await page.keyboard.press('a');
  await page.keyboard.up(modifier);
  await page.keyboard.press('Backspace');
  expect(await page.$eval('textarea', textarea => textarea.value)).toBe('');
});

it('should be able to prevent selectAll', async ({page, server, isMac}) => {
  await page.goto(server.PREFIX + '/input/textarea.html');
  const textarea = await page.$('textarea');
  await textarea.type('some text');
  await page.$eval('textarea', textarea => {
    textarea.addEventListener('keydown', event => {
      if (event.key === 'a' && (event.metaKey || event.ctrlKey))
        event.preventDefault();
    }, false);
  });
  const modifier = isMac ? 'Meta' : 'Control';
  await page.keyboard.down(modifier);
  await page.keyboard.press('a');
  await page.keyboard.up(modifier);
  await page.keyboard.press('Backspace');
  expect(await page.$eval('textarea', textarea => textarea.value)).toBe('some tex');
});

it('should support MacOS shortcuts', (test, { platform }) => {
  test.skip(platform !== 'darwin');
}, async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/textarea.html');
  const textarea = await page.$('textarea');
  await textarea.type('some text');
  // select one word backwards
  await page.keyboard.press('Shift+Control+Alt+KeyB');
  await page.keyboard.press('Backspace');
  expect(await page.$eval('textarea', textarea => textarea.value)).toBe('some ');
});

it('should press the meta key', async ({page, isFirefox, isMac}) => {
  const lastEvent = await captureLastKeydown(page);
  await page.keyboard.press('Meta');
  const {key, code, metaKey} = await lastEvent.jsonValue();
  if (isFirefox && !isMac)
    expect(key).toBe('OS');
  else
    expect(key).toBe('Meta');

  if (isFirefox)
    expect(code).toBe('OSLeft');
  else
    expect(code).toBe('MetaLeft');

  if (isFirefox && !isMac)
    expect(metaKey).toBe(false);
  else
    expect(metaKey).toBe(true);

});

it('should work after a cross origin navigation', async ({page, server}) => {
  await page.goto(server.PREFIX + '/empty.html');
  await page.goto(server.CROSS_PROCESS_PREFIX + '/empty.html');
  const lastEvent = await captureLastKeydown(page);
  await page.keyboard.press('a');
  expect(await lastEvent.evaluate(l => l.key)).toBe('a');
});

// event.keyIdentifier has been removed from all browsers except WebKit
it('should expose keyIdentifier in webkit', (test, { browserName }) => {
  test.skip(browserName !== 'webkit');
}, async ({page}) => {
  const lastEvent = await captureLastKeydown(page);
  const keyMap = {
    'ArrowUp': 'Up',
    'ArrowDown': 'Down',
    'ArrowLeft': 'Left',
    'ArrowRight': 'Right',
    'Backspace': 'U+0008',
    'Tab': 'U+0009',
    'Delete': 'U+007F',
    'a': 'U+0041',
    'b': 'U+0042',
    'F12': 'F12',
  };
  for (const [key, keyIdentifier] of Object.entries(keyMap)) {
    await page.keyboard.press(key);
    expect(await lastEvent.evaluate(e => e.keyIdentifier)).toBe(keyIdentifier);
  }
});

it('should scroll with PageDown', async ({page, server}) => {
  await page.goto(server.PREFIX + '/input/scrollable.html');
  // A click is required for WebKit to send the event into the body.
  await page.click('body');
  await page.keyboard.press('PageDown');
  // We can't wait for the scroll to finish, so just wait for it to start.
  await page.waitForFunction(() => scrollY > 0);
});

async function captureLastKeydown(page) {
  const lastEvent = await page.evaluateHandle(() => {
    const lastEvent = {
      repeat: false,
      location: -1,
      code: '',
      key: '',
      metaKey: false,
      keyIdentifier: 'unsupported'
    };
    document.addEventListener('keydown', e => {
      lastEvent.repeat = e.repeat;
      lastEvent.location = e.location;
      lastEvent.key = e.key;
      lastEvent.code = e.code;
      lastEvent.metaKey = e.metaKey;
      // keyIdentifier only exists in WebKit, and isn't in TypeScript's lib.
      lastEvent.keyIdentifier = 'keyIdentifier' in e && e['keyIdentifier'];
    }, true);
    return lastEvent;
  });
  return lastEvent;
}
