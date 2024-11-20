const CONTROL_A = '\x01';
const CONTROL_B = '\x02';
const CONTROL_C = '\x03';
const CONTROL_D = '\x04';
const CONTROL_E = '\x05';
const ENTER = '\r\n';
const END = `${ENTER}>>> `;
const EXPRESSION = '__code_last_line_expression__';
const LINE_SEPARATOR = /(?:\r\n|\r|\n)/;
const MACHINE = [
  'from sys import implementation as _',
  'print(hasattr(_, "_machine") and _._machine or _.name)',
  '_=None',
  'del _',
  ENTER,
].join(';');

// Xterm.js dependencies via CDN
const CDN = 'https://cdn.jsdelivr.net/npm';
const CODEDENT = '0.1.2';
const XTERM = '5.3.0';
const ADDON_FIT = '0.10.0';
const ADDON_WEB_LINKS = '0.11.0';

const { assign } = Object;
const { parse } = JSON;
const { serial } = navigator;
const defaultOptions = { hidden: true, raw: false };

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
    import(`${CDN}/codedent@${CODEDENT}/+esm`),
    import(`${CDN}/xterm@${XTERM}/+esm`),
    import(`${CDN}/@xterm/addon-fit@${ADDON_FIT}/+esm`),
    import(`${CDN}/@xterm/addon-web-links@${ADDON_WEB_LINKS}/+esm`),
  ];
};

const exec = async (code, writer, raw = false) => {
  for (const line of code.split(LINE_SEPARATOR)) {
    await writer.write(`${line}\r`);
    await sleep(10);
  }
  if (raw) {
    await writer.write(CONTROL_D);
    await sleep(10);
  }
};

const noop = () => {};

/**
 * @param {string} action 
 * @returns {Error}
 */
const reason = (action, evaluating) => new Error(
  evaluating ?
    `Unable to ${action} while evaluating` :
    `Unable to ${action} when disconnected`
);

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
 * @prop {string} [dataType='buffer']
 * @prop {() => void} [onconnect]
 * @prop {() => void} [ondisconnect]
 * @prop {(error:Error) => void} [onerror=console.error]
 * @prop {(buffer:Uint8Array) => void} [ondata]
 * @prop {{ background:string, foreground:string }} [theme]
 */

/** @type {MicroREPLOptions} */
const options = {
  baudRate: 115200,
  dataType: 'buffer',
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
 * @prop {(code:string, options?: { hidden:boolean }) => Promise<void>} eval
 */

/**
 * @param {MicroREPLOptions} options
 * @returns {MicroREPLBoard}
 */
export default function Board({
  baudRate = options.baudRate,
  dataType = options.dataType,
  onconnect = options.onconnect,
  ondisconnect = options.ondisconnect,
  onerror = options.onerror,
  ondata = options.ondata,
  onresult = parse,
  theme = options.theme,
} = options) {
  let evaluating = 0;
  let showEval = false;
  let port = null;
  let terminal = null;
  let element = null;
  let name = 'unknown';
  let accumulator = '';
  let aborter, dedent, readerClosed, writer, writerClosed;

  // last meaningful line
  const lml = () => accumulator.split(ENTER).at(-2);

  const forIt = async () => {
    while (!accumulator.endsWith(END)) await sleep(5);
    const result = lml();
    accumulator = '';
    return result;
  };

  const board = {
    // board instanceof Board
    __proto__: Board.prototype,

    get connected() { return !!port },
    get baudRate() { return baudRate },
    get name() { return name },
    get terminal() { return terminal },

    /**
     * On user action, connects the board and bootstrap an Xterm.js REPL in the target node.
     * @param {string | Element} target where the REPL shows its output or accepts its input.
     * @returns
     */
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

        port = await serial.getPorts()
          .then(ports => ports.map(port => port.getInfo()))
          .then(filters => serial.requestPort({ filters }));

        const [
          { default: codedent },
          { Terminal },
          { FitAddon },
          { WebLinksAddon },
        ] = await Promise.all(libs.concat(port.open({ baudRate })));

        const { background, foreground } = theme;
        const color = style(target, foreground, 'color');
        const behind = style(target, background, 'background-color');

        dedent = codedent;

        terminal = new Terminal({
          cursorBlink: true,
          cursorStyle: "block",
          theme: {
            cursor: color,
            foreground: color,
            selectionForeground: behind,
            background: behind,
            selectionBackground: color,
          },
        });

        const encoder = new TextEncoderStream;
        writerClosed = encoder.readable.pipeTo(port.writable);
        writer = encoder.writable.getWriter();

        const decoder = new TextDecoder;
        const machine = Promise.withResolvers();
        let waitForMachine = false;

        const reveal = chunk => {
          if (dataType === 'string')
            ondata(decoder.decode(chunk));
          else
            ondata(chunk);
          terminal.write(chunk);
        };

        const writable = new WritableStream({
          write(chunk) {
            if (evaluating) {
              if (1 < evaluating)
                accumulator += decoder.decode(chunk);
              else if (showEval)
                reveal(chunk);
            }
            else if (waitForMachine) {
              accumulator += decoder.decode(chunk);
              if (accumulator.endsWith(END) && accumulator.includes(MACHINE)) {
                machine.resolve(lml());
                accumulator = '';
              }
            }
            else {
              reveal(chunk);
            }
          }
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
                  if (evaluating) {
                    evaluating = 0;
                    accumulator = '';
                  }
                  board.reset();
                  return false;
                }
              }
            }
            // prevent errors with huge content passed in paste mode
            else if (pastMode && composed && ctrlKey && shiftKey && code === 'KeyV') {
              event.preventDefault();
              navigator.clipboard.readText().then(async code => {
                while (evaluating) await sleep(10);
                await exec(code, writer);
              });
              return false;
            }
          }
          return true;
        });

        terminal.onData(chunk => {
          if (!evaluating) writer.write(chunk);
        });

        const fitAddon = new FitAddon;
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(new WebLinksAddon);
        terminal.open(target);
        fitAddon.fit();
        terminal.focus();

        // bootstrap with board name details
        await writer.write(CONTROL_C);
        await sleep(options.baudRate * 50 / baudRate);
        waitForMachine = true;

        // enter paste mode - no history attached
        await writer.write(CONTROL_E);
        await writer.write(MACHINE);
        await writer.write(CONTROL_D);

        name = await machine.promise;
        waitForMachine = false;

        // clean up latest row and start fresh
        terminal.write('\x1b[M');
        terminal.write(`${name}${END}`);

        onconnect();

        return board;
      }
      catch (error) {
        port = null;
        onerror(error);
      }
    },

    /**
     * Destroy the terminal after disconnecting the board.
     */
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

    /**
     * Evaluate code and optionally returns last line, if single reference, after a `json.dumps`.
     * @param {string} code Python code to evaluate
     * @param {{ hidden?: boolean }} [options] if `hidden` is true, show all lines/errors on terminal
     * @returns {Promise<any>} if last line of the `code` was a single reference, it returns its JSON parsed value
     */
    eval: async (code, { hidden = true } = defaultOptions) => {
      if (port && !evaluating) {
        evaluating = 1;
        showEval = !hidden;
        let outcome = null;
        const lines = dedent(code).split(LINE_SEPARATOR);
        while (lines.length && !lines.at(-1).trim()) lines.pop();
        let asRef = false, asPatch = false, result = '';
        if (lines.length) {
          result = lines.at(-1);
          asRef = /^[a-zA-Z0-9._]+$/.test(result);
          if (!asRef && /^\S+/.test(result) && !/[;=]/.test(result)) {
            asRef = asPatch = true;
            lines.pop();
            lines.push(`${EXPRESSION}=${result}`, EXPRESSION);
            result = EXPRESSION;
          }
          await exec(lines.join(ENTER), writer);
        }
        if (asRef) {
          await writer.write(
            `import json;print(json.dumps(${result}))${ENTER}`
          );
          evaluating = 2;
          try {
            outcome = onresult(await forIt());
          }
          finally {
            evaluating = 0;
            showEval = false;
          }
        }
        else {
          evaluating = 0;
          showEval = false;
        }
        // free ram on patched code evaluation
        if (asPatch)
          await board.paste(`${EXPRESSION}=None`, defaultOptions);
        return outcome;
      }
      else onerror(reason('eval', evaluating));
    },

    /**
     * Set the board in paste mode then send the whole code to evaluate.
     * @param {string} code Python code to evaluate
     * @param {{ hidden?: boolean, raw?: boolean }} [options] if `hidden` is `false`,
     *  it shows all lines/errors on terminal. If `raw` is `true`, it puts the terminal in raw mode.
     */
    paste: async (code, { hidden = true, raw = false } = defaultOptions) => {
      if (port && !evaluating) {
        showEval = !hidden;
        evaluating = hidden ? 2 : 1;
        await writer.write(raw ? CONTROL_A : CONTROL_E);
        await exec(dedent(code), writer, raw);
        await writer.write(raw ? CONTROL_B : CONTROL_D);
        if (hidden) await forIt();
        // terminal.write('\x1b[M\x1b[A');
        evaluating = 0;
        showEval = false;
      }
      else onerror(reason('paste', evaluating));
    },

    /**
     * Upload a file to the board showing some progress while doing that.
     * @param {string} path the name of the file to upload.
     * @param {string | File | Blob} content the file content as string or blob or as file.
     * @param {(current, total) => void} onprogress an optional callback to receive current uploaded and total.
     */
    upload: async (path, content, onprogress = noop) => {
      if (port && !evaluating) {
        const { stringify } = JSON;
        const { fromCharCode } = String;

        const base64 = view => {
          const b64 = '';
          for (let args = 2000, i = 0; i < view.length; i += args)
            b64 += fromCharCode(...view.slice(i, i + args));
          return btoa(b64);
        };

        const update = (i, length) => {
          onprogress(i, length);
          const value = (i * 100 / length).toFixed(2);
          terminal.write(`\x1b[M... uploading ${path} ${value}% `);
        };

        const view = typeof content === 'string' ?
          new TextEncoder().encode(content) :
          new Uint8Array(await content.arrayBuffer())
        ;

        const code = dedent(`
            with open(${stringify(path)},"wb") as f:
              import binascii
              f.write(binascii.a2b_base64("${base64(view)}"))
              f.close()
        `);

        let i = 0, { length } = code;

        evaluating = 2;
        // enter raw mode
        await writer.write(CONTROL_A);
        // notify beginning
        update(i, length);
        // write the whole code
        while (i < length) {
          await writer.write(code[i++]);
          update(i, length);
          // pause every 256 chars to allow UI
          // to show changes (too greedy otherwise)
          if (!(i % 256)) await sleep(0);
        }
        // commit raw code
        await writer.write(CONTROL_D);
        // exit raw mode
        await writer.write(CONTROL_B);
        terminal.write(`\x1b[M... decoding ${path} `);
        await forIt();
        evaluating = 0;
        terminal.write(`\x1b[M... uploaded ${path} ${ENTER}>>> `);
        terminal.focus();
      }
      else onerror(reason('upload', evaluating));
    },

    /**
     * Reset the board and put it back in REPL mode + focus.
     * @param {number} delay how long before the REPL should be reactivated
     */
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
      else onerror(reason('reset', evaluating));
    },

    /**
     * Raw write to the board any string as it is.
     * @param {string} code any raw string to write directly to the board
     */
    write: async code => {
      if (port && !evaluating) await writer.write(code);
      else onerror(reason('write', evaluating));
    },
  };

  return board;
}
