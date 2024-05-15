const CONTROL_C = '\x03';
const CONTROL_D = '\x04';
const ENTER = '\r\n';
const LINE_SEPARATOR = /(?:\r|\n|\r\n)/;
const MACHINE = [
  'from sys import implementation as _',
  'print(hasattr(_, "_machine") and _._machine or _.name)',
  'del _',
  ENTER,
].join(';');

// Xterm.js dependencies via CDN
const CDN = 'https://cdn.jsdelivr.net/npm';
const XTERM = '5.3.0';
const ADDON_FIT = '0.10.0';
const ADDON_WEB_LINKS = '0.11.0';

const { assign } = Object;
const { parse } = JSON;

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

const exec = async (code, writer, lines = []) => {
  for (const line of code.split(LINE_SEPARATOR)) {
    lines.push(line);
    await writer.write(`${line}\r`);
    await sleep(10);
  }
};

const noop = () => {};

/**
 * @param {string} action 
 * @returns {Error}
 */
const reason = action => new Error(`Unable to ${action} when disconnected`);

const sleep = async delay => new Promise(res => setTimeout(res, delay));

/**
 * Return a specific value or infer it from the live element.
 * @param {Element} target
 * @param {string} value
 * @param {string} property
 * @returns {string}
 */
const style = (target, value, property) => (
  value === 'infer' ?
    getComputedStyle(target).getPropertyValue(property) :
    value
);

/**
 * @typedef {Object} MicroREPLOptions
 * @prop {number} [baudRate=115200]
 * @prop {() => void} [onconnect]
 * @prop {() => void} [ondisconnect]
 * @prop {(error:Error) => void} [onerror=console.error]
 * @prop {(buffer:Uint8Array) => void} [ondata]
 * @prop {{ background:string, foreground:string }} [theme]
 */

/** @type {MicroREPLOptions} */
const options = {
  baudRate: 115200,
  onconnect: noop,
  ondisconnect: noop,
  onerror: console.error,
  ondata: noop,
  theme: {
    background: "#191A19",
    foreground: "#F5F2E7",
  }
};

/**
 * @typedef {Object} MicroREPLBoard
 * @prop {boolean} connected
 * @prop {number} baudRate
 * @prop {string} name
 * @prop {import('xterm').Terminal} terminal
 * @prop {(target:Element | string) => Promise<MicroREPLBoard | void>} connect
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
  theme = options.theme,
} = options) {
  let evaluating = 0;
  let port = null;
  let terminal = null;
  let element = null;
  let name = 'unknown';
  let accumulator = '';
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
      if (typeof target === 'string') {
        target = (
          document.getElementById(target) ||
          document.querySelector(target)
        );
      }
      try {
        const libs = dependencies(target);

        element = target;
        port = await navigator.serial.requestPort();

        const [
          { Terminal },
          { FitAddon },
          { WebLinksAddon },
        ] = await Promise.all(libs.concat(port.open({ baudRate })));

        const { background, foreground } = theme;
        const color = style(target, foreground, 'color');

        terminal = new Terminal({
          cursorBlink: true,
          cursorStyle: "block",
          theme: {
            color,
            background,
            foreground: color,
          },
        });

        const encoder = new TextEncoderStream;
        writerClosed = encoder.readable.pipeTo(port.writable);
        writer = encoder.writable.getWriter();

        const decoder = new TextDecoder;
        const machine = Promise.withResolvers();
        let waitForMachine = true;

        const writable = new WritableStream({
          write: createWriter({
            write(chunk) {
              if (evaluating) {
                if (1 < evaluating) accumulator += decoder.decode(chunk);
                return;
              }
              if (waitForMachine) {
                const text = decoder.decode(chunk);
                if (accumulator === '' && text.startsWith(ENTER))
                  chunk = new Uint8Array(chunk.slice(ENTER.length));
                accumulator += text;
                let i = accumulator.indexOf(MACHINE);
                if (-1 < i) {
                  i += MACHINE.length;
                  const gotIt = accumulator.slice(i).split(ENTER);
                  if (gotIt.length === 2) {
                    waitForMachine = false;
                    accumulator = '.';
                    machine.resolve(gotIt[0]);
                  }
                }
              }
              else ondata(chunk);
              terminal.write(chunk);
              if (accumulator === '.') {
                accumulator = '';
                for (let i = 2; i < 4; i++) {
                  terminal.write('\x1b[A'.repeat(i));
                  terminal.write('\x1b[2K'.repeat(i));
                  terminal.write('\x1b[B'.repeat(i));
                }
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
          if (type === 'keydown') {
            if (composed && ctrlKey && !shiftKey) {
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
            // prevent errors with huge content passed in paste mode
            else if (pastMode && composed && ctrlKey && shiftKey && code === 'KeyV') {
              event.preventDefault();
              navigator.clipboard.readText().then(code => exec(code, writer));
              return false;
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

    eval: async code => {
      if (port) {
        evaluating = 1;
        let outcome;
        const lines = [];
        await exec(code, writer, lines);
        while (lines.length && !lines.at(-1)) lines.pop();
        const result = lines.at(-1);
        if (/^[a-zA-Z0-9._()]+$/.test(result)) {
          await writer.write(`import json;print(json.dumps(${result}))${ENTER}`);
          evaluating = 2;
          while (!accumulator.endsWith(`${ENTER}>>> `)) await sleep(1);
          try { outcome = parse(accumulator.split(ENTER).at(-2)); }
          finally { accumulator = ''; }
        }
        evaluating = 0;
        return outcome;
      }
      else onerror(reason('eval'));
    },

    reset: async (delay = 500) => {
      if (port) {
        await writer.write(CONTROL_D);
        while (port) {
          await sleep(delay);
          // for boards losing the REPL mode on soft-reset
          if (port && /\n $/.test(element.innerText))
            await writer.write(CONTROL_C);
          else
            break;
        }
        terminal.focus();
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
