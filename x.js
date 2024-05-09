const CONTROL_C = '\x03';

const createWriter = writer => chunk => writer.write(chunk);

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
   * Invoked each time the terminal receives data as buffer.
   * @param {Uint8Array} buffer
   */
  onData(buffer) {},
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
 * @prop {(buffer:Uint8Array) => void} [onData]
 * @prop {(error?:Error) => void} [onceClosed]
 */

export default async (/** @type {Options} */{
  target,
  baudRate = options.baudRate,
  onData = options.onData,
  onceClosed = options.onceClosed,
} = options) => {
  if (!(target instanceof Element))
    throw new Error("The `target` property is not a valid DOM element.");

  // optimistic AOT dynamic import for all dependencies
  const dependencies = [
    import('https://cdn.jsdelivr.net/npm/xterm@5.3.0/+esm'),
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
    { FitAddon },
    { WebLinksAddon },
  ] = await Promise.all(dependencies);

  const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      theme: {
          background: "#191A19",
          foreground: "#F5F2E7",
      },
  });

  // create the writer
  const encoder = new TextEncoderStream;
  const writerClosed = encoder.readable.pipeTo(port.writable);
  const writer = encoder.writable.getWriter();

  // forward the reader
  const readerClosed = port.readable.pipeTo(
    new WritableStream({
      write: createWriter({
        write(chunk) {
          onData(chunk);
          return terminal.write(chunk);
        }
      })
    })
  );

  terminal.onData(createWriter(writer));

  const fitAddon = new FitAddon;
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(new WebLinksAddon);
  terminal.open(target);
  fitAddon.fit();
  terminal.focus();

  let active = true;

  try {
    await writer.write(CONTROL_C);
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
    get output() {
      if (!active) error('read');
      return target.innerText;
    },

    /**
     * Flag the port as inactive and closes it.
     * This dance without unknown errors has been brought to you by:
     * https://stackoverflow.com/questions/71262432/how-can-i-close-a-web-serial-port-that-ive-piped-through-a-transformstream
     */
    close: async () => {
      if (active) {
        active = false;
        writer.close();
        await readerClosed.catch(Object); // no-op - expected
        await writerClosed;
        await port.close();
        onceClosed(null);
      }
    },

    /**
     * Write code to the active port, throws otherwise.
     * @param {string} code 
     */
    write: async code => {
      if (!active) error('write');
      await writer.write(code);
    },
  };
};
