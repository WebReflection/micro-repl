import machine, utime

try:
    led = machine.Pin("LED", machine.Pin.OUT)

    while True:
        led.on()
        print("led on")
        utime.sleep_ms(1000)
        led.off()
        print("led off")
        utime.sleep_ms(1000)
except:
    print("REPL")
