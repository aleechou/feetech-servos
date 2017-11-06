const serial = require("serialport")

var portPath = "/dev/ttyUSB0"

var unpackBuffer = new Buffer(0)
var rspnCallbacks = {}


serial.list(function(a, ports) {
    for (let portinfo of ports) {
        if (!portinfo.serialNumber)
            return
        console.log(portinfo)
    }
})



var port = new serial(portPath, { baudRate: 1000000 })
port.on('error', function(err) {
    console.log('Error: ', err.message)
})
port.on('open', function() {
    console.log('opened')
})
port.on('data', function(data) {

    console.log("<<", data)

    unpackBuffer = Buffer.concat([unpackBuffer, data])

    for (let pkg; pkg = unpack();) {

        if (pkg[pkg.length - 1] != checksum(pkg)) {
            console.log("pkg's check sum is bad:", pkg, checksum(pkg))
            continue
        }

        console.log("receive pkg", pkg)

        let servoId = pkg[2]
        if (!rspnCallbacks[servoId]) {
            continue
        }
        let error = pkg[4]
        if (error > 0) {
            rspnCallbacks[servoId](error)
            delete rspnCallbacks[servoId]
            continue
        }

        let len = pkg[3]
        let params = pkg.slice(5, 5 + len - 2)

        rspnCallbacks[servoId](null, params)
        delete rspnCallbacks[servoId]
    }

})


function unpack() {

    let pkgAddr = -1

    for (let i = 0; i < unpackBuffer.length; i++) {
        if (unpackBuffer[i] == 0xFF && unpackBuffer[i + 1] == 0xFF) {
            pkgAddr = i
            break
        }
    }

    // 没有找到标志位置
    if (pkgAddr < 0) {
        unpackBuffer = new Buffer(0)
        return null
    }
    let len = unpackBuffer[pkgAddr + 3]

    let pkg = unpackBuffer.slice(pkgAddr, pkgAddr + 4 + len)

    unpackBuffer = unpackBuffer.slice(pkgAddr + 4 + len)

    return pkg
}

function receive(servoId) {
    return new Promise((resolve, reject) => {
        rspnCallbacks[servoId] = (error, data) => {
            if (error)
                reject(error)
            else
                resolve(data)
        }
    })
}

function checksum(buff) {
    var value = 0
    for (var i = 2; i < buff.length - 1; i++) {
        value += buff[i]
    }
    return (~value) & 255
}

function send(servoId, cmd, params) {
    if (cmd == undefined)
        cmd = 0x03
    if (params == undefined)
        params = []

    var buff = new Buffer(6 + params.length)
    buff[0] = buff[1] = 0xFF
    buff[2] = servoId

    buff[3] = params.length + 2 // 长度
    buff[4] = cmd // 指令

    // params
    for (let i = 0; i < params.length; i++) {
        buff[5 + i] = params[i]
    }

    buff[buff.length - 1] = checksum(buff)

    return new Promise((resolve, reject) => {
        console.log(">>", buff)
        port.write(buff, (err) => {
            if (err)
                reject(err)
            else
                resolve(null)
        })
    })
}


function read(servoId, addr, length) {
    send(servoId, 0x02, [addr, length])
    return receive(servoId)
}

function write(servoId, cmd, addr, data) {
    send(servoId, cmd, [addr].concat(data))
    return receive(servoId)
}

function ping(servoId) {

    var buff = new Buffer(6)
    buff[0] = buff[1] = 0xFF
    buff[2] = servoId

    buff[3] = 0x02 // 长度
    buff[4] = 0x01 // 指令 PING

    buff[5] = checksum(buff)

    send(servoId, 0x01)
}

function turnToPosition(servoId, pos) {
    return write(servoId, 0x03, 0x2A, [pos >> 8, pos & 255])
}


async function position(servoId) {
    var data = await read(servoId, 0x38, 2)
    return data[0] << 8 | data[1]
}

(async function() {

    var pos = await position(1)
    console.log(pos)

    await turnToPosition(1, 351)

    var pos = await position(1)
    console.log(pos)

})()