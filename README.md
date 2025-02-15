# micro-repl

<sup>**Social Media Photo by [Luca J](https://unsplash.com/@lucajns) on [Unsplash](https://unsplash.com/)**</sup>

An easy, SerialPort based, MicroPython REPL for micro controllers.

  * **[Live Serial Demo](https://webreflection.github.io/micro-repl/board/)**
  * **[Live PyScript Demo](https://webreflection.github.io/micro-repl/mpy/)** which uses *MicroPython* on the browser to communicate with the boards 🤯

### Supported Serials

It is very likely that your *MicroPython* based board works too but these have been manually, and personally, tested during the development of this module:

  * [Spike Prime](https://spike.legoeducation.com/prime/lobby/)
  * [Raspberry Pi Pico and Pico W](https://www.raspberrypi.com/documentation/microcontrollers/raspberry-pi-pico.html)
  * [Adafruit PyPortal - CircuitPython](https://www.adafruit.com/product/4116)
  * [Arduino Nano ESP32](https://store.arduino.cc/products/nano-esp32)<br>
    <sup>I used `dfu-util -a 0 -d 0x2341:0x0070 -D ./ARDUINO_NANO_ESP32-X.app-bin` to install *MicroPython* on it: [app-bin download](https://micropython.org/download/ARDUINO_NANO_ESP32/)</sup>

- - -

## Features

The currently maintained and developed export is `micro-repl/serial` (*previously known as board*) which supports the following features:

  * board `name` showed as soon as connected and associated to the *board* instance
  * fully interactive *REPL* mode out of the box
  * tab completion works out of the box too
  * every *Control+X* combination just works
  * stopping running code via *Control+C* also works
  * uploading data (text or binary files) works too
  * pasting code also works
  * paste mode never overflows the writes (big files copy pasted with ease)
  * safe (after prompt) reboot on *Control-D* when not inside a *paste mode* session
  * `ondata(buffer:Uint8Array)` passes along, while interacting, every single char the user is asking for
  * *AutoFit* and *WebLinks* plugins available out of the box
  * all imports are dynamic so it's size is still minimal before its usage
  * `eval` method, if awaited and the end of the code has a reference or an expression, will return that value, if any, beside evaluating code without showing it on *REPL* shell. If the extra `options` reference `hidden` value is `false`, it also shows the evaluated code while streaming it to the board.
  * `paste` method to pass along code in "*paste mode*" with ease, where `raw: true` is also available

The `micro-repl/board` alias still exists but it's now `micro-repl/serial` instead, to eventually allow `micro-repl/bt` and others within the same ease of use.

## How To / Documentation

The easiest way to use `micro-repl/serial` is via *CDN*:

```html
<script type="module">
  import Serial from 'https://esm.run/micro-repl/serial';

  // either Serial(...) or new Serial(...)
  const board = Serial({
    // all optionals
    baudRate: 9600, // defaults to 115200
    onconnect() { console.info('connected') },
    ondisconnect() { console.warn('disconnected') },
    onerror(error) { console.error(error) },
    ondata(buffer) { },
    // pass a different JSON parser if needed: json.loads,
    // as example, would return directly Python references
    onresult: JSON.parse,
  });

  // to connect a board a user action/gesture is needed
  document.getElementById('repl').onclick = async event => {
    event.preventDefault();

    // connect the board to a DOM element to show the terminal
    await board.connect(event.target);
  };
</script>
<div id="repl"></div>
```

### micr-repl/serial TS signature

Documented via JSDoc TS, these are all explicit TS details around this module's API.

#### options

These are all optional fields that can be passed when creating a new *Serial*.

```ts
type MicroREPLOptions = {
  // default: 115200
  baudRate?: number | undefined;
  // default: 'buffer'
  dataType?: 'buffer' | 'string';
  // default: console.error
  onerror?: ((error: Error) => void) | undefined;
  // default: () => void - notifies when the board is connected
  onconnect?: (() => void) | undefined;
  // default: () => void - notifies when the board is disconnected/lost
  ondisconnect?: (() => void) | undefined;
  // default: () => void - receives all data from the terminal
  ondata?: ((buffer: Uint8Array) => void) | undefined;
  // allow terminal easy-theme setup - if values are "infer"
  // these are retrieved via computed style / CSS values
  // for background (or background-color) and color (as foreground)
  // default: { background: "#191A19", foreground: "#F5F2E7" }
  theme?: {
        background: string;
        foreground: string;
    } | undefined;
}
```

#### serial board

A *serial board* can be created via `new Serial(options)` or just direct `Serial(options)` ( <sup>which is more Pythonic</sup> ) and its returned reference is always an `instanceof Serial`.

```ts
type MicroREPLSerialBoard = {
  // `true` when connected, `false` otherwise
  readonly connected: boolean;
  // the passed `baudRate` option
  readonly baudRate: number;
  // the connected board name
  readonly name: string;
  // the Terminal reference once connected
  readonly terminal: xterm.Terminal;
  // ⚠️ must be done on user action !!!
  // connects the board and show the REPL in the specified `target`
  // `target` can be either a DOM Element or an element ID or a CSS selector.
  connect: (target: Element | string) => Promise<MicroREPLSerialBoard | void>;
  // disconnect the board and invoke ondisconnect
  disconnect: () => Promise<void>;
  // soft-reset the board and put it back into REPL mode
  reset: () => Promise<void>;
  // write any string directly to the board
  write: (code: string) => Promise<void>;
  // eval any code (no output while processing)
  // if the end of the `code` is a reference, it tries
  // to json serialize it and parse it back as result.
  // if the options.hidden is `false` it shows the input
  // while evaluating code.
  eval: (code: string, options?: { hidden:boolean }) => Promise<any>;
  // enter paste mode, write all code, then exit from paste mode
  paste: (code: string, options?: { hidden:boolean, raw:boolean }) => Promise<void>;
  // upload content as text or `File` and save it as `path` name
  upload: (path: string, content: string | File, on_progress?: (current:number, total:number) => void) => Promise<void>;
}
```

Please note that `board.write(code)` requires `\r\n` at the end if you want your code to be executed.

Please also note this is not the same as `board.terminal.write(...)` because the terminal depends on writes on the board, not vice-versa.

- - -

<sup><sub>**WARNING**</sub></sup>

Please note this module is experimental. The current exports might change if actually the *board* reference is the best option this module offers (and I am definitively leading toward this conclusion).

- - -

### Troubleshooting

If you are on Linux and you can't see your *Prime* you can try to force-enable it by writing the following content into `/etc/udev/rules.d/50-myusb.rules`:

```
KERNEL=="ttyACM[0-9]*",MODE="0666"
```

After a reboot, this instruction should enable it and you should see it selectable.

![ttyACM0 selectable](./css/spike.png)

### Credits

This project has been inspired by [pyrepl-js](https://github.com/gabrielsessions/pyrepl-js) but because I think *React* and *TypeScript*, plus the rest of the logic, was a bit too much for a basic core *REPL*, I've decided to create a minimal *JS* standard module able to do pretty much the same in way less code to maintain. Feel free to use that project if you want a more rich *UI* around the connection, events instead of just promises to deal with unbuffered data as sent by the controller, and everything else in there which I didn't need to create those live demoes.

#### micro-repl TS signature

**deprecated**

Once a `repl` has been successfully initialized, it offers this *API*:

```ts
// The default export TS signature
({ baudRate, onceClosed, }?: {
    baudRate: number; // default: 115200
    onceClosed(error: Error | null): void;
}) => Promise<{
    readonly active: boolean;
    readonly result: Promise<string>;
    readonly output: Promise<string>;
    write: (code: string) => Promise<...>;
    close: () => Promise<...>;
}>
```

#### Signature description

  * **repl.active** as `boolean` - it's `true` when the *REPL* is active and running, `false` otherwise.
  * **repl.result** as `Promise<string>` - it contains the last line produced by the last executed code.
  * **repl.output** as `Promise<string>` - it awaits for the last executed code to execute and returns whatever that code produced, including the written code itself. Please note this throws an error if the `active` state is not `true`.
  * **repl.write(code)** as `(code:string) => Promise<void>` - it writes code to the boards' *REPL* and it fulfills after all code has been sent. Please note this throws an error if the `active` state is not `true`.
  * **repl.close()** as `() => Promise<void>` - it detaches all streams and gracefully clean up the `repl` state right before disconnecting it.

### Example

```js
// check the board status
repl.active; // true

// write code into the REPL
await repl.write('print("Hello MicroPython")');

// wait/check the produced REPL outcome
await repl.output;
/**
 * >>> print("Hello MicroPython")
 * Hello MicroPython
 */

// check the result (last printed line of the REPL)
await repl.result;  // "Hello MicroPython"

// disconnect the board
await repl.close();

// check the board status again
repl.active; // false
```
