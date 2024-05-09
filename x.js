const EOL = /\r\n(?:>>>|\.\.\.) +$/;
const ENTER = '\r\n';
const CONTROL_C = '\x03';
const CONTROL_D = '\x04';
const CONTROL_E = '\x05';
const LINE_SEPARATOR = /(?:\r|\n|\r\n)/;

/**
 * Common error for `read` or `write` when the REPL
 * is not active anymore.
 * @param {string} action
 */
const error = action => {
  throw new Error(`Unable to ${action} a closed SerialPort`);
};

// default `init(options)` values
const options = {
  baudRate: 115200,
  /**
   * Invoked once the repl has been closed or an
   * error occurred. In the former case `error` is `null`,
   * in every other case the `error` is what the REPL produced.
   * @param {Error?} error
   */
  onceClosed(error) {
    if (error) console.error(error);
  },
};

/**
 * @typedef {Object} Options
 * @prop {Element} target
 * @prop {number} [baudRate=115200]
 * @prop {(error?:Error) => void} [onceClosed]
 */

export default async (/** @type {Options} */{
  target,
  baudRate = options.baudRate,
  onceClosed = options.onceClosed,
} = options) => {
  if (!(target instanceof Element))
    throw new Error("The `target` property is not a valid DOM element.");

  // optimistic AOT dynamic import for all dependencies
  const dependencies = [
    import('https://cdn.jsdelivr.net/npm/xterm@5.3.0/+esm'),
    import('https://cdn.jsdelivr.net/npm/xterm-readline@1.1.1/+esm'),
    import('https://cdn.jsdelivr.net/npm/@xterm/addon-fit/+esm'),
    import('https://cdn.jsdelivr.net/npm/@xterm/addon-web-links/+esm'),
  ];

  // bring in the CSS too if not already present
  if (!document.querySelector('link[rel="stylesheet"][href$="/css/xterm.min.css"]')) {
    document.head.append(
      Object.assign(
        document.createElement('link'),
        {
          rel: 'stylesheet',
          href: 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.min.css',
        }
      )
    );
  }

  let port;
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate });
  }
  catch (error) {
    onceClosed(error);
    throw error;
  }

  const [
    { Terminal },
    { Readline },
    { FitAddon },
    { WebLinksAddon },
  ] = await Promise.all(dependencies);

  // create the reader
  const decoder = new TextDecoderStream;
  const readerClosed = port.readable.pipeTo(decoder.writable);
  const reader = decoder.readable.getReader();

  // create the writer
  const encoder = new TextEncoderStream;
  const writerClosed = encoder.readable.pipeTo(port.writable);
  const writer = encoder.writable.getWriter();

  const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      theme: {
          background: "#191A19",
          foreground: "#F5F2E7",
      },
  });
  const fitAddon = new FitAddon;
  const readline = new Readline;
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(readline);
  terminal.loadAddon(new WebLinksAddon);
  terminal.open(target);
  fitAddon.fit();
  terminal.focus();
  terminal.attachCustomKeyEventHandler(event => {
    const { code, composed, ctrlKey, shiftKey } = event;
    if (active && composed && ctrlKey && !shiftKey && code === 'KeyD') {
      event.preventDefault();
      writer.write(CONTROL_D).then(close);
      return false;
    }
    return true;
  });

  let active = true;
  let result = Promise.withResolvers();
  result.resolve('');

  /**
   * Flag the port as inactive and closes it.
   * This dance without unknown errors has been brought to you by:
   * https://stackoverflow.com/questions/71262432/how-can-i-close-a-web-serial-port-that-ive-piped-through-a-transformstream
   */
  const close = async () => {
    if (active) {
      active = false;
      reader.cancel();
      await readerClosed.catch(Object); // no-op - expected
      writer.close();
      await writerClosed;
      await port.close();
      onceClosed(null);
    }
  };

  // calculate the delay time accordingly with the baudRate
  // the faster the baudRate the lower is the delay.
  // 115200 means 60FPS ... 30FPS might be safer though
  // but it feels weird on the eyes.
  const delay = (1000 / 60) * 115200 / baudRate;

  const read = async ({ length }) => {
    let output = '', buffer = true;
    result = Promise.withResolvers();
    return (async function loop() {
      let { value, done } = await reader.read();
      if (done) {
        result.resolve('');
        reader.releaseLock();
      }
      else {
        output += value;
        if (buffer && output.length >= length) {
          buffer = false;
          value = output.slice(length);
        }
        if (!buffer) {
          readline.write(value);
          if (EOL.test(output)) {
            const lines = output.split(ENTER);
            const last = lines.pop();
            result.resolve(lines.join(ENTER));
            readline.read(last).then(write);
            return result.promise;
          }
        }
        // give the reader a chance to finish reading
        // up to the next interactive line
        setTimeout(loop, delay);
      }
      return result.promise;
    })();
  };

  const write = async (code) => {
    // normalize lines
    const lines = code.split(LINE_SEPARATOR);
    // single line input
    if (lines.length === 1) {
      code = `${lines[0]}${ENTER}`;
      await writer.write(code);
    }
    // multi line input: switch to paste mode
    else {
      terminal.write('\x1b[2K\x1b[A'.repeat(lines.length + 1));
      await writer.write(CONTROL_E);
      await writer.write(lines.join('\r'));
      await writer.write(CONTROL_D);
      code = `paste mode; Ctrl-C to cancel, Ctrl-D to finish${ENTER}`;
    }
    return read(code);
  };

  try {
    await writer.write(CONTROL_C);
    read('');
  }
  catch (error) {
    onceClosed(error);
    throw error;
  }

  return {
    /** @type {Terminal} */
    get terminal() { return terminal },

    /** @type {boolean} */
    get active() { return active; },

    /** @type {Promise<string>} */
    get result() {
      return result.promise;
    },

    /** @type {Promise<string>} */
    get output() {
      if (!active) error('read');
      return result.promise.then(() => target.innerText);
    },

    close,

    /**
     * Write code to the active port, throws otherwise.
     * @param {string} code 
     */
    write: async code => {
      if (!active) error('write');
      return await write(code);
    },
  };
};
