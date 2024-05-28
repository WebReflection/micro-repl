import machine, utime

class NanoLed:
    def __init__(self):
        self._led = machine.Pin(0, machine.Pin.OUT)

    def on(self):
        self._led.off()

    def off(self):
        self._led.on()

    def value(self):
        if self._led.value() == 1:
            return 0
        else:
            return 1

try:
    led = NanoLed()

    while True:
        led.on()
        utime.sleep_ms(1000)
        led.off()
        utime.sleep_ms(1000)
except:
    print("REPL")
