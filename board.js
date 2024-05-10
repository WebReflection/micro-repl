const CONTROL_C = '\x03';
const CONTROL_D = '\x04';
const ENTER = '\r\n';
const MACHINE = `import sys;print(sys.implementation._machine)${ENTER}`;

// Xterm.js dependencies via CDN
const CDN = 'https://cdn.jsdelivr.net/npm';
const XTERM = '5.3.0';
const ADDON_FIT = '0.10.0';
const ADDON_WEB_LINKS = '0.11.0';

const { assign } = Object;

const createWriter = writer => chunk => writer.write(chunk);

/**
 * @param {Element} target
 * @returns {Promise<unknown>[]}
 */
const dependencies = ({ ownerDocument }) => {
  const rel = 'stylesheet';
  const href = `${CDN}/xterm@${XTERM}/css/xterm.min.css`;
  const link = `link[rel="${rel}"][href="${href}"]`;
  if (!ownerDocument.querySelector(link)) {
    ownerDocument.head.append(
      assign(ownerDocument.createElement('link'), { rel, href })
    );
  }
  return [
    import(`${CDN}/xterm@${XTERM}/+esm`),
    import(`${CDN}/@xterm/addon-fit@${ADDON_FIT}/+esm`),
    import(`${CDN}/@xterm/addon-web-links@${ADDON_WEB_LINKS}/+esm`),
  ];
};

const noop = () => {};

/**
 * @param {string} action 
 * @returns {Error}
 */
const reason = action => new Error(`Unable to ${action} when disconnected`);

/**
 * @typedef {Object} MicroREPLOptions
 * @prop {number} [baudRate=115200]
 * @prop {() => void} [onconnect]
 * @prop {() => void} [ondisconnect]
 * @prop {(error:Error) => void} [onerror=console.error]
 * @prop {(buffer:Uint8Array) => void} [ondata]
 */

/** @type {MicroREPLOptions} */
const options = {
  baudRate: 115200,
  onconnect: noop,
  ondisconnect: noop,
  onerror: console.error,
  ondata: noop,
};

/**
 * @typedef {Object} MicroREPLBoard
 * @prop {boolean} connected
 * @prop {number} baudRate
 * @prop {string} name
 * @prop {import('xterm').Terminal} terminal
 * @prop {(target:Element) => Promise<MicroREPLBoard | void>} connect
 * @prop {() => Promise<void>} disconnect
 * @prop {() => Promise<void>} reset
 * @prop {(code:string) => Promise<void>} write
 */

/**
 * @param {MicroREPLOptions} options
 * @returns {MicroREPLBoard}
 */
export default function Board({
  baudRate = options.baudRate,
  onconnect = options.onconnect,
  ondisconnect = options.ondisconnect,
  onerror = options.onerror,
  ondata = options.ondata,
} = options) {
  let port = null;
  let terminal = null;
  let element = null;
  let name = 'unknown';
  let aborter, readerClosed, writer, writerClosed;

  const board = {
    // board instanceof Board
    __proto__: Board.prototype,

    get connected() { return !!port },
    get baudRate() { return baudRate },
    get name() { return name },
    get terminal() { return terminal },

    connect: async target => {
      if (port) return board;
      try {
        const libs = dependencies(target);

        element = target;
        port = await navigator.serial.requestPort();

        const [
          { Terminal },
          { FitAddon },
          { WebLinksAddon },
        ] = await Promise.all(libs.concat(port.open({ baudRate })));

        terminal = new Terminal({
            cursorBlink: true,
            cursorStyle: "block",
            theme: {
                background: "#191A19",
                foreground: "#F5F2E7",
            },
        });

        const encoder = new TextEncoderStream;
        writerClosed = encoder.readable.pipeTo(port.writable);
        writer = encoder.writable.getWriter();

        const decoder = new TextDecoder;
        const machine = Promise.withResolvers();
        let waitForMachine = true;
        let accMachine = '';

        const writable = new WritableStream({
          write: createWriter({
            write(chunk) {
              if (waitForMachine) {
                const text = decoder.decode(chunk);
                if (accMachine === '' && text.startsWith(ENTER))
                  chunk = new Uint8Array(chunk.slice(ENTER.length));
                accMachine += text;
                let i = accMachine.indexOf(MACHINE);
                if (-1 < i) {
                  i += MACHINE.length;
                  const gotIt = accMachine.slice(i).split(ENTER);
                  if (gotIt.length === 2) {
                    waitForMachine = false;
                    accMachine = '.';
                    machine.resolve(gotIt[0]);
                  }
                }
              }
              else ondata(chunk);
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

        aborter = new AbortController;
        readerClosed = port.readable.pipeTo(writable, aborter).catch(() => {
          if (port) board.disconnect();
        });

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
                board.reset();
                return false;
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

        await writer.write(CONTROL_C);
        await writer.write(MACHINE);

        name = await machine.promise;

        onconnect();

        return board;
      }
      catch (error) {
        port = null;
        onerror(error);
      }
    },

    disconnect: async () => {
      if (port) {
        const sp = port;
        const t = terminal;
        port = null;
        terminal = null;
        try {
          aborter.abort('disconnect');
          writer.close();
          await writerClosed;
          await readerClosed;
          await sp.close();
          t.dispose();
        }
        finally {
          ondisconnect();
        }
      }
    },

    reset: async () => {
      if (port) {
        await writer.write(CONTROL_D);
        // for boards losing the REPL mode on soft-reset
        while (port) {
          await new Promise(res => setTimeout(res, 1500));
          if (port && /\n $/.test(element.innerText))
            await writer.write(CONTROL_C);
          else
            break;
        }
      }
      else onerror(reason('reset'));
    },

    write: async code => {
      if (port) await writer.write(code);
      else onerror(reason('write'));
    },
  };

  return board;
}
