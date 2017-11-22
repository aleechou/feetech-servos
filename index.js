const serial = require("serialport")
const EventEmitter = require('events');

function promiseWrap(func) {
    return function() {
        return new Promise((resolve, reject) => {
            arguments[arguments.length] = (error, ...arg) => {
                if (error) reject(error)
                else resolve(...arg)
            }
            arguments.length += 1
            func.apply(this, arguments)
        })
    }
}

class FeetechServos {

    constructor(path) {

        this.unpackBuffer = new Buffer(0)
        this.rspnCallbacks = {}

        this.__proto__ = new serial(path, { autoOpen: false, baudRate: 1000000 })
        this.open = promiseWrap(serailport.open)

        port.on('error', function(err) {
            console.log('Error: ', err.message)
        })
        port.on('open', function() {
            console.log('opened')
        })
        port.on('data', (data) => {

            console.log("<<", data)

            this.unpackBuffer = Buffer.concat([this.unpackBuffer, data])

            for (let pkg; pkg = this.unpack();) {

                if (pkg[pkg.length - 1] != this.checksum(pkg)) {
                    console.log("pkg's check sum is bad:", pkg, this.checksum(pkg))
                    continue
                }

                console.log("receive pkg", pkg)

                let servoId = pkg[2]
                if (!this.rspnCallbacks[servoId]) {
                    continue
                }
                let error = pkg[4]
                if (error > 0) {
                    this.rspnCallbacks[servoId](error)
                    delete this.rspnCallbacks[servoId]
                    continue
                }

                let len = pkg[3]
                let params = pkg.slice(5, 5 + len - 2)

                this.rspnCallbacks[servoId](null, params)
                delete this.rspnCallbacks[servoId]
            }
        })
    }


    unpack() {

        let pkgAddr = -1

        for (let i = 0; i < this.unpackBuffer.length; i++) {
            if (this.unpackBuffer[i] == 0xFF && this.unpackBuffer[i + 1] == 0xFF) {
                pkgAddr = i
                break
            }
        }

        // 没有找到标志位置
        if (pkgAddr < 0) {
            this.unpackBuffer = new Buffer(0)
            return null
        }
        let len = this.unpackBuffer[pkgAddr + 3]

        let pkg = this.unpackBuffer.slice(pkgAddr, pkgAddr + 4 + len)

        this.unpackBuffer = this.unpackBuffer.slice(pkgAddr + 4 + len)

        return pkg
    }


    checksum(buff) {
        var value = 0
        for (var i = 2; i < buff.length - 1; i++) {
            value += buff[i]
        }
        return (~value) & 255
    }

    send(servoId, cmd, params) {
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

        buff[buff.length - 1] = this.checksum(buff)

        return new Promise((resolve, reject) => {
            port.write(buff, (err) => {
                if (err)
                    reject(err)
                else
                    resolve(null)
            })
        })
    }

    receive(servoId) {
        return new Promise((resolve, reject) => {
            this.rspnCallbacks[servoId] = (error, data) => {
                if (error)
                    reject(error)
                else
                    resolve(data)
            }
        })
    }



    read(servoId, addr, length) {
        this.send(servoId, 0x02, [addr, length])
        return this.receive(servoId)
    }

    write(servoId, cmd, addr, data) {
        this.send(servoId, cmd, [addr].concat(data))
        return this.receive(servoId)
    }


    ping(servoId) {

        var buff = new Buffer(6)
        buff[0] = buff[1] = 0xFF
        buff[2] = servoId

        buff[3] = 0x02 // 长度
        buff[4] = 0x01 // 指令 PING

        buff[5] = this.checksum(buff)

        this.send(servoId, 0x01)
    }

    turnToPosition(servoId, pos) {
        return this.write(servoId, 0x03, 0x2A, [pos >> 8, pos & 255])
    }

    async position(servoId) {
        var data = await this.read(servoId, 0x38, 2)
        return data[0] << 8 | data[1]
    }
}

FeetechServos.list = promiseWrap(serial.list.bind(serial))

module.exports = FeetechServos