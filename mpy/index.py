from pyscript import document, window

from pyscript.js_modules.micro_repl import default as Board
from pyscript.js_modules.dedent import default as dedent

async def on_keydown(event):
    if event.code == "Enter":
        import asyncio, json
        value = json.dumps(message.value)
        message.value = ""
        # await board.write(f"""print("showing:", {value})\r\n""")
        # await asyncio.sleep(0.1)
        board.eval(dedent(f"""
            from hub import light_matrix

            light_matrix.write({value})
        """))
        return False

async def on_toggle(event):
    led.disabled = True
    value = await board.eval(dedent(f"""
        led_value = led.value()
        led_value
    """))
    if value == 1:
        await board.eval("led.off()")
    else:
        await board.eval("led.on()")
    led.disabled = False

def on_connect():
    print("connected")
    connect.disabled = True
    reset.disabled = False
    if board.name == "SPIKE Prime with STM32F413":
        message.hidden = False
        message.onkeydown = on_keydown
    else:
        led.hidden = False
        led.onclick = on_toggle

def on_disconnect():
    print("disconnected")
    connect.disabled = False
    reset.disabled = True
    led.hidden = True
    message.hidden = True

def on_error(error):
    window.console.warn(error)

async def on_reset(error):
    reset.disabled = True
    board.terminal.reset()
    await board.reset()
    reset.disabled = False

async def on_click(event):
    await board.connect(output)
    window.board = board

board = Board({
    "onconnect": on_connect,
    "ondisconnect": on_disconnect,
    "onerror": on_error,
})

connect, reset, led, message, output, = document.querySelectorAll(
    "#connect, #reset, #led, #message, #output"
)

connect.onclick = on_click
reset.onclick = on_reset
