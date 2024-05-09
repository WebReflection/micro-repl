from pyscript import document

from pyscript.js_modules.dedent import default as dedent
from pyscript.js_modules.micro_repl import default as init

active = False
board = None
connect, toggle, = document.querySelectorAll("#connect, #toggle")

async def ontoggle(e):
    global active, board
    active = not active
    if active:
        R = 255
        G = 255
        B = 255
    else:
        R = 0
        G = 0
        B = 0
    await board.write(dedent(f"""
        pixel[0] = ({R},{G},{B})
        pixel.write()
    """))

async def onclick(event):
    global board
    connect.disabled = True
    board = await init()
    toggle.disabled = False
    toggle.onclick = ontoggle
    print('Board active', board.active)
    await board.write(dedent("""
        import machine, neopixel
        pixel_pin = 16
        pixel = neopixel.NeoPixel(machine.Pin(pixel_pin), 1)
    """))

connect.onclick = onclick
