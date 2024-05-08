const ENTER = '\r\n';
const CONTROL_C = '\x03';
const CONTROL_D = '\x04';
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

function withLast(line) {
  'use strict';
  switch (true) {
    case line === `>>> ${this}`:
    case line === `...     ${this}`:
    case line === `... ${this}`:
    case line === this:
      return true;
  }
  return false;
}

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

  const read = async last => {
    let line = '';
    result = Promise.withResolvers();
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        result.resolve('');
        reader.releaseLock();
        break;
      }
      else {
        line += value;
        switch (true) {
          case line.endsWith(`${ENTER}>>> `):
          case line.endsWith(`${ENTER}...     `):
          case line.endsWith(`${ENTER}... `):
            const lines = line.split(ENTER);
            const results = [];
            for (let i = lines.findIndex(withLast, last) + 1; i < lines.length - 1; i++) {
              results.push(lines[i]);
              readline.println(lines[i]);
            }
            result.resolve(results.join(ENTER));
            return readline.read(lines.at(-1)).then(write);
        }
      }
    }
  };

  const write = async (code) => {
    // normalize lines
    const lines = code.split(LINE_SEPARATOR);
    await writer.write(`${lines.join(ENTER)}${ENTER}`);
    read(lines.at(-1));
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
      await write(code);
    },
  };
};
