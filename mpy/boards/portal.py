# Others in
# https://docs.circuitpython.org/projects/displayio-layout/en/latest/examples.html

# SPDX-FileCopyrightText: 2021 Kevin Matocha
#
# SPDX-License-Identifier: MIT

# DEMO:
# from toggle import led, loop

"""
Creates a single sliding switch widget.
"""

import time
import board
import displayio
import adafruit_touchscreen
from adafruit_displayio_layout.widgets.switch_round import SwitchRound as _Switch

_display = board.DISPLAY

_width = _display.width
_height = _display.height

_center = {
    "x": int(_width / 2),
    "y": int(_height / 2),
}

_ts = adafruit_touchscreen.Touchscreen(
    board.TOUCH_XL,
    board.TOUCH_XR,
    board.TOUCH_YD,
    board.TOUCH_YU,
    calibration=((5200, 59000), (5800, 57000)),
    size=(_width, _height),
)

# Create the switch
_my_switch = _Switch(
    _center["x"] - 25,
    _center["y"] - 15,
)


_my_group = displayio.Group()
_my_group.append(_my_switch)

# Add my_group to the display
_display.root_group = _my_group

class PortalLed:
    def __init__(self, point):
        self._p = point

    def on(self):
        global _selected
        if not _selected:
            _selected = not _selected
            _my_switch.selected(self._p)

    def off(self):
        global _selected
        if _selected:
            _selected = not _selected
            _my_switch.selected(self._p)

    def value(self):
        if _selected:
            return 1
        else:
            return 0

_selected = False

led = PortalLed((
    _center["x"],   # x
    _center["y"],   # y
    42000,          # pressure
))

def loop():
    global _selected
    print("Ctrl+C or Ctrl+D to break the loop")
    while True:
        p = _ts.touch_point  # get any touches on the screen

        if p:  # Check each switch if the touch point is within the switch touch area
            # If touched, then flip the switch with .selected
            if _my_switch.contains(p):
                _selected = not _selected
                _my_switch.selected(p)

        time.sleep(0.05)  # touch response on PyPortal is more accurate with a small delay
