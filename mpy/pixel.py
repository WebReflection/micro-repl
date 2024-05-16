import machine, utime, neopixel

pixel = None
pixel_light = (255, 255, 255)
pixel_dark = (0, 0, 0)

def pixel_toggle():
    r, g, b, = pixel[0]

    if r == pixel_dark[0]:
        r, g, b, = pixel_light
    else:
        r, g, b, = pixel_dark

    pixel[0] = (r, g, b)
    pixel.write()

try:
    pixel = neopixel.NeoPixel(machine.Pin(16), 1)

    while True:
        pixel_toggle()
        utime.sleep_ms(1000)
except:
    print("REPL")
