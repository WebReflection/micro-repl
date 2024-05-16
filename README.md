# micro-repl

<sup>**Social Media Photo by [Luca J](https://unsplash.com/@lucajns) on [Unsplash](https://unsplash.com/)**</sup>

An easy, SerialPort based, MicroPython REPL for micro controllers.

  * **[Live Board Demo](https://webreflection.github.io/micro-repl/board/)**
  * **[Live PyScript Demo](https://webreflection.github.io/micro-repl/mpy/)** which uses *MicroPython* on the browser to communicate with the boards 🤯

Each demo has been successfully tested on both [Spike Prime](https://spike.legoeducation.com/prime/lobby/), [Raspberry Pi Pico and Pico W](https://www.raspberrypi.com/documentation/microcontrollers/raspberry-pi-pico.html) and [Adafruit PyPortal - CircuitPython](https://www.adafruit.com/product/4116) ( <sup><sub>up to the `help()` it should work in other boards too</sub></sup> ).

- - -

## Features

The currently maintained and developed export is `micro-repl/board` which supports the following features:

  * board `name` showed as soon as connected
  * fully interactive *REPL* mode out of the box
  * tab completion works out of the box too
  * every *Control+X* combination just works
  * stopping running code via *Control+C* also works
  * pasting code also works
  * paste mode never overflows the writes (big files copy pasted with ease)
  * safe (after prompt) reboot on *Control-D* when not inside a *paste mode* session
  * `ondata(buffer:Uint8Array)` passes along, while interacting, every single char the user is asking for
  * *AutoFit* and *WebLinks* plugins available out of the box
  * all imports are dynamic so it's size is still minimal before its usage
  * `eval` method, if awaited and the end of the code has a reference, will return that value, if any, beside evaluating code without showing it on *REPL* shell

Please **note** `micro-repl/board` is going to be renamed as `micro-repl/serial` instead, to eventually allow `micro-repl/bt` and others within the same ease of use.

## How To / Documentation

The easiest way to use `micro-repl/serial` or `micro-repl/board` is via *CDN*:

```html
<script type="module">
  import Board from 'https://esm.run/micro-repl/serial';

  const board = new Board({
    // all optionals
    baudRate: 9600, // defaults to 115200
    onconnect() { console.info('connected') },
    ondisconnect() { console.warn('disconnected') }
    onerror(error) { console.error(error) },
    ondata(buffer) { }
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

### micr-repl/board TS signature

Documented via JSDoc TS, these are all explicit TS details around this module's API.

#### options

These are all optional fields that can be passed when creating a new *Board*.

```ts
type MicroREPLOptions = {
  // default: 115200
  baudRate?: number | undefined;
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

#### board

A *board* can be created via `new Board(options)` or just direct `Board(options)` ( <sup>which is more Pythonic</sup> ) and its returned reference is always an `instanceof Board`.

```ts
type MicroREPLBoard = {
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
  connect: (target: Element | string) => Promise<MicroREPLBoard | void>;
  // disconnect the board and invoke ondisconnect
  disconnect: () => Promise<void>;
  // soft-reset the board and put it back into REPL mode
  reset: () => Promise<void>;
  // write any string directly to the board
  write: (code: string) => Promise<void>;
  // eval any code (no output while processing)
  // if the end of the `code` is a reference, it tries
  // to json serialize it and parse it back as result
  eval: (code: string) => Promise<void>;
}
```

Please note that `board.write(code)` requires `\r\n` at the end if you want your code to be executed.

Please also note this is not the same as `board.terminal.write(...)` because the terminal depends on writes on the board, not vice-versa.

- - -

<sup><sub>**WARNING**</sub></sup>

Please note this module is experimental. The current exports might change if actually the *board* is the best option this module offers (and I am definitively leading toward this conclusion).

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
