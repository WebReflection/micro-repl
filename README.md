# micro-repl

An easy, SerialPort based, MicroPython REPL for micro controllers.

**[Spike3 Live Demo](https://webreflection.github.io/micro-repl/)**

- - -

## Documentation

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

Once a `repl` has been successfully initialized, it offers this *API*:

  * **repl.active** as `boolean` - it's `true` when the *REPL* is active and running, `false` otherwise.
  * **repl.output** as `Promise<string>` - it awaits for the last executed code to execute and returns whatever that code produced, including the written code itself.
  * **repl.result** as `Promise<string>` - it contains the last line produced by the last executed code.
  * **repl.write(code)** as `(code:string) => Promise<void>` - it writes code to the boards' *REPL* and it fulfills after all code has been sent.
  * **repl.close()** as `() => Promise<void>` - it detaches all streams and gracefully clean up the `repl` state right before disconnecting it.

### Example

```js
// after initializing a REPL, write code to it:
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
```
