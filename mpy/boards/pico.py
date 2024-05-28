import machine, utime

try:
    led = machine.Pin("LED", machine.Pin.OUT)

    while True:
        led.on()
        utime.sleep_ms(1000)
        led.off()
        utime.sleep_ms(1000)
except:
    print("REPL")
