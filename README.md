# micro-repl

An easy, SerialPort based, MicroPython REPL for micro controllers.

  * **[Live Xterm Demo](https://webreflection.github.io/micro-repl/xterm/)**
  * **[Live JS Demo](https://webreflection.github.io/micro-repl/)**
  * **[Live PyScript Demo](https://webreflection.github.io/micro-repl/mpy/)** which uses *MicroPython* on the browser to communicate with the *Spike* 🤯

Each demo has been successfully tested on both [Spike Prime](https://spike.legoeducation.com/prime/lobby/) and [Raspberry Pi Pico and Pico W](https://www.raspberrypi.com/documentation/microcontrollers/raspberry-pi-pico.html) ( <sup><sub>up to the `help()` it should work in other boards too</sub></sup> ).

- - -

## How To / Documentation

The easiest way to use this module is via *CDN*:

```html
<script type="module">
  import init from 'https://esm.run/micro-repl';

  // to connect a board a user action/gesture is needed
  document.getElementById('repl').onclick = async event => {
    event.preventDefault();

    // create a `repl` that can execute code and read its outcome.
    const repl = await init({
      // the optional desired board baudRate
      // it's 115200 by default.
      baudRate: 115200,

      // the optional callback invoked when either
      // the `repl` has been closed or an error occurred.
      onceClosed(error) {
        // by default it logs the error in devtools
        if (error) console.error(error);
      },
    });
  };
</script>
```

#### TypeScript signaturehttps://github.com/gabrielsessions/pyrepl-js

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

## Xterm.js REPL

The `micro-repl/x` variant brings in the mighty [Xterm.js](https://xtermjs.org/) to the mix, enabling a close to real-world *REPL* solution.

The only difference in its signature to bootstrap is that a `target` *element* is needed to start the terminal.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script type="module">
    import xtermInit from 'https://esm.run/micro-repl/x';

    connect.onclick = async () => {
      connect.disabled = true;
      // bootstrap after user action
      xtermInit({
        target: repl,
        onceClosed(error) {
          connect.disabled = false;
          if (error) console.warn(error);
        }
      });
    };
  </script>
</head>
<body>
  <button id="connect">connect</button>
  <div id="repl"></div>
</body>
</html>
```

### Troubleshooting

If you are on Linux and you can't see your *Prime* you can try to force-enable it by writing the following content into `/etc/udev/rules.d/50-myusb.rules`:

```
KERNEL=="ttyACM0",MODE="0666"
```

After a reboot, this instruction should enable it and you should see it selectable.

![ttyACM0 selectable](./css/spike.png)

### Credits

This project has been inspired by [pyrepl-js](https://github.com/gabrielsessions/pyrepl-js) but because I think *React* and *TypeScript*, plus the rest of the logic, was a bit too much for a basic core *REPL*, I've decided to create a minimal *JS* standard module able to do pretty much the same in way less code to maintain. Feel free to use that project if you want a more rich *UI* around the connection, events instead of just promises to deal with unbuffered data as sent by the controller, and everything else in there which I didn't need to create those live demoes.
