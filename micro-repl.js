const ENTER = '\r\n';
const CONTROL_C = '\x03';
const CONTROL_E = '\x05';
const CONTROL_D = '\x04';
const LINE_SEPARATOR = /(?:\r|\n|\r\n)/;

const error = action => {
  throw new Error(`Unable to ${action} a closed SerialPort`);
};

const options = {
  baudRate: 115200,
  onceClosed(error) {
    if (error) console.error(error);
  },
};

export default async ({
  baudRate = options.baudRate,
  onceClosed = options.onceClosed,
} = options) => {
  let port;
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate });
  }
  catch (error) {
    onceClosed(error);
    throw error;
  }

  // create the reader
  const decoder = new TextDecoderStream;
  const readerClosed = port.readable.pipeTo(decoder.writable);
  const reader = decoder.readable.getReader();

  // create the writer
  const encoder = new TextEncoderStream;
  const writerClosed = encoder.readable.pipeTo(port.writable);
  const writer = encoder.writable.getWriter();

  // internal helpers
  const uuid = `# ${crypto.randomUUID()}`;
  const eop = `${uuid}${ENTER}`;
  const ignore = new Set([
    '=== ',
    'paste mode; Ctrl-C to cancel, Ctrl-D to finish',
  ]);

  let output = '';
  let result = '';
  let active = true;
  let wait = Promise.withResolvers();

  try {
    await writer.write(CONTROL_C);
    await writer.write(eop);
  }
  catch (error) {
    onceClosed(error);
    throw error;
  }

  (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        reader.releaseLock();
        break;
      }
      output += value;
      if (output.endsWith(`${eop}>>> `))
        output = output.slice(0, -4);
      if (output.endsWith(eop)) {
        const out = [];
        for (const line of output.split(ENTER)) {
          if (ignore.has(line) || line.includes(uuid)) continue;
          out.push(line.replace(/^=== \n/, ''));
        }
        output = '';
        if (out[0] === '>>> ') {
          out.shift();
          out[0] = out[0].replace(/^=== /, '>>> ');
        }
        result = out.at(-2);
        wait.resolve(out.join(ENTER).trimStart());
      }
    }
  })().catch(async error => {
    active = false;
    onceClosed(error);
  });

  return {
    /** @type {boolean} */
    get active() { return active; },

    /** @type {Promise<string>} */
    get output() {
      if (!active) error('read');
      return wait.promise;
    },

    /** @type {Promise<string>} */
    get result() {
      return wait.promise.then(() => result);
    },

    /**
     * Flag the port as inactive and closes it.
     * This dance without unknown errors has been brought to you by:
     * https://stackoverflow.com/questions/71262432/how-can-i-close-a-web-serial-port-that-ive-piped-through-a-transformstream
     */
    close: async () => {
      if (active) {
        active = false;
        reader.cancel();
        await readerClosed.catch(Object); // no-op - expected
        writer.close();
        await writerClosed;
        await port.close();
        output = '';
        onceClosed(null);
      }
    },

    /**
     * Write code to the active port, throws otherwise.
     * @param {string} code 
     */
    write: async code => {
      if (!active) error('write');
      await wait.promise;
      wait = Promise.withResolvers();
      await writer.write(CONTROL_E);
      for (const line of code.split(LINE_SEPARATOR))
        await writer.write(line + ENTER);
      await writer.write(CONTROL_D);
      await writer.write(eop);
    },
  };
};
