import machine, utime

class ZeroLed:
    def __init__(self):
        import neopixel
        self._np = neopixel.NeoPixel(machine.Pin(16), 1)
        self._value = 0
        self.off()

    def on(self):
        self._value = 1
        self._np[0] = (255, 255, 255)
        self._np.write()

    def off(self):
        self._value = 0
        self._np[0] = (0, 0, 0)
        self._np.write()

    def value(self):
        return self._value

try:
    led = ZeroLed()

    while True:
        led.on()
        utime.sleep_ms(1000)
        led.off()
        utime.sleep_ms(1000)
except:
    print("REPL")
