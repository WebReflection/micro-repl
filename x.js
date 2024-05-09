const CONTROL_C = '\x03';
const ENTER = '\r\n';
const MACHINE = `import sys;print(sys.implementation._machine)${ENTER}`;

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
    port.ondisconnect = () => onceClosed(0);
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

  const decoder = new TextDecoder;

  const machine = Promise.withResolvers();
  let waitForMachine = true;
  let accMachine = '';

  // forward the reader
  const writable = new WritableStream({
    write: createWriter({
      write(chunk) {
        if (waitForMachine) {
          const text = decoder.decode(chunk);
          if (accMachine === '' && text.startsWith(ENTER))
            chunk = new Uint8Array(chunk.slice(ENTER.length));
          accMachine += text;
          const i = accMachine.indexOf(MACHINE);
          if (-1 < i) {
            const gotIt = accMachine.slice(i + MACHINE.length).split(ENTER);
            if (gotIt.length === 2) {
              waitForMachine = false;
              accMachine = '.';
              machine.resolve(gotIt[0]);
            }
          }
        }
        else onData(chunk);
        terminal.write(chunk);
        if (accMachine === '.') {
          accMachine = '';
          terminal.write('\x1b[A'.repeat(2));
          terminal.write('\x1b[2K'.repeat(2));
          terminal.write('\x1b[B'.repeat(2));
        }
      }
    })
  });

  const aborter = new AbortController;
  const readerClosed = port.readable.pipeTo(writable, aborter);

  /**
   * Flag the port as inactive and closes it.
   * This dance without unknown errors has been brought to you by:
   * https://stackoverflow.com/questions/71262432/how-can-i-close-a-web-serial-port-that-ive-piped-through-a-transformstream
   */
  const close = async () => {
    if (active) {
      active = false;
      aborter.abort();
      writer.close();
      await writerClosed;
      await readerClosed.catch(Object); // no-op - expected
      await port.close();
      onceClosed(null);
    }
  };

  let pastMode = false;
  terminal.attachCustomKeyEventHandler(event => {
    const { type, code, composed, ctrlKey, shiftKey } = event;
    if (type === 'keydown' && composed && ctrlKey && !shiftKey) {
      if (pastMode)
        pastMode = code !== 'KeyD';
      else {
        if (code === 'KeyE')
          pastMode = true;
        else if (code === 'KeyD') {
          event.preventDefault();
          if (confirm('Reboot?'))
            setTimeout(close, 1000);
        }
      }
    }
    return true;
  });

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
    await writer.write(MACHINE);
  }
  catch (error) {
    onceClosed(error);
    throw error;
  }

  return machine.promise.then(name => ({
    /** @type {string} */
    get name() { return name },

    /** @type {Terminal} */
    get terminal() { return terminal },

    /** @type {boolean} */
    get active() { return active; },

    /** @type {string} */
    get output() {
      if (!active) error('read');
      return target.innerText;
    },

    close,

    /**
     * Write code to the active port, throws otherwise.
     * @param {string} code 
     */
    write: async code => {
      if (!active) error('write');
      await writer.write(code);
    },
  }));
};
