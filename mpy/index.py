from pyscript import document, window

from pyscript.js_modules.dedent import default as dedent
from pyscript.js_modules.micro_repl import default as init

connect, output, = document.querySelectorAll("#connect, #output")

def once_closed(error):
    connect.disabled = False
    if (error):
        window.console.warn(error)

def show(content):
    code = document.createElement("code")
    code.textContent = content
    output.append(code)

def onclick(event):
    connect.disabled = True
    output.replaceChildren()
    # TODO: async listeners are currently broken in MicroPython
    # TODO: destructuring is also currently broken in MicroPython
    #       which is why I need to pass the defaults anyway
    init({ "baudRate": 115200, "onceClosed": once_closed }).then(execute)

async def execute(spike3):
    print('Spike3 active', spike3.active)
    show(await spike3.output)
    await spike3.write('help()')
    show(await spike3.output)
    await spike3.write(dedent("""
        from hub import light_matrix
        import runloop

        async def main():
            await light_matrix.write("Hello World!")

        runloop.run(main())
    """))
    await spike3.write(dedent("""
        def test():
            return 1 + 2

        print(test())
    """))
    show(await spike3.output)
    await spike3.close()
    print('Spike3 active', spike3.active)
    result = await spike3.result
    print('last result', result)

connect.onclick = onclick
