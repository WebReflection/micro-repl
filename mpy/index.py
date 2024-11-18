from pyscript import document, window
from pyscript.js_modules.micro_repl import default as Board
import json

# setup the board
def on_connect():
    from events import keydown, toggle
    connect.disabled = True
    reset.disabled = False
    file.hidden = False
    if board.name == "SPIKE Prime with STM32F413":
        message.hidden = False
        message.onkeydown = keydown(board)
    else:
        led.hidden = False
        led.onclick = toggle(board)

    # # Test implicit expression as last line
    # print(await board.eval("""
    #     import os
    #     os.listdir('/')
    # """))

def on_disconnect():
    connect.disabled = False
    reset.disabled = True
    led.hidden = True
    message.hidden = True
    file.hidden = True

def on_error(error):
    window.console.warn(error)

board = Board({
    "onconnect": on_connect,
    "ondisconnect": on_disconnect,
    "onerror": on_error,
    "onresult": json.loads,
})

# setup the DOM
async def on_click(event):
    await board.connect(output)
    window.board = board

async def on_reset(error):
    reset.disabled = True
    board.terminal.reset()
    await board.reset()
    reset.disabled = False

def write_chunk(ui8, start, end):
    import json
    codes = [c for c in ui8.slice(start, start + end)]
    json_codes = json.dumps(codes, separators=[',', ':'])
    return f'f.write("".join([chr(c) for c in {json_codes}]))'

async def on_change(event):
    currentTarget = event.currentTarget
    for file in currentTarget.files:
        # create a utf-8 list of bytes
        ui8 = window.Uint8Array.new(await file.arrayBuffer())
        name = file.name
        size = file.size
        # up to 32 seems to be fine
        # over 32 is not always fine
        increment = 32
        i = 0
        progress.hidden = False
        currentTarget.replaceWith(progress)
        await board.paste(f'f=open("{name}","wb")')
        while i < size:
            progress.value = int(i * 100 / size)
            await board.paste(write_chunk(ui8, i, increment), hidden = True)
            i += increment
        progress.value = 100
        await board.paste(f'f.close()')
    currentTarget.value = ''
    progress.replaceWith(currentTarget)
    progress.value = 0

connect, reset, led, message, file, progress, output, = document.querySelectorAll(
    "#connect, #reset, #led, #message, #file, #progress, #output"
)

connect.onclick = on_click
reset.onclick = on_reset
file.onchange = on_change
