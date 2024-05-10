from pyscript import document, window

from pyscript.ffi import to_js
from pyscript.js_modules.micro_repl import default as Board

def on_connect():
    print("connected")
    connect.disabled = True
    reset.disabled = False

def on_disconnect():
    print("disconnected")
    connect.disabled = False
    reset.disabled = True

def on_error(error):
    window.console.warn(error)

async def on_reset(error):
    reset.disabled = True
    await board.reset()
    reset.disabled = False

async def on_click(event):
    await board.connect(output)
    window.board = board

board = Board(to_js({
    "onconnect": on_connect,
    "ondisconnect": on_disconnect,
    "onerror": on_error,
}))

connect, reset, output, = document.querySelectorAll("#connect, #reset, #output")

connect.onclick = on_click
reset.onclick = on_reset
