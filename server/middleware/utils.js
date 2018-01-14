const addDanmu = require('./Dao').addDanmu;
const addBlacker = require('./Dao').addBlacker;
const ws = require('ws')
const events = require('events')
const request = require('request-promise')
const socks_agent = require('socks-proxy-agent')
const REQUEST_TIMEOUT = 10000
const REFRESH_GIFT_INFO_INTERVAL = 30 * 60 * 1000

class longzhu_danmu extends events {
    constructor(roomid, proxy) {
        super()
        this._roomid = roomid
        this.set_proxy(proxy)
    }

    set_proxy(proxy) {
        this._agent = null
        if (proxy) {
            let auth = ''
            if (proxy.name && proxy.pass)
                auth = `${proxy.name}:${proxy.pass}@`
            let socks_url = `socks://${auth}${proxy.ip}:${proxy.port || 8080}`
            this._agent = new socks_agent(socks_url)
        }
    }

    async _get_gift_info() {
        let opt = {
            url: 'http://configapi.plu.cn/item/getallitems',
            timeout: REQUEST_TIMEOUT,
            json: true,
            gzip: true,
            agent: this._agent
        }
        try {
            let body = await request(opt)
            if (!body) {
                return null
            }
            let gift_info = {}
            body.forEach(item => {
                let type, price
                switch (item.costType) {
                    case 1:
                        type = '龙币'
                        price = item.costValue * 100
                        break;
                    case 2:
                        type = '龙豆'
                        price = item.costValue
                    default:
                        type = item.costType + ''
                        price = item.costValue
                        break;
                }
                gift_info[item.name] = {
                    name: item.title,
                    price: price,
                    type: type
                }
            })
            return gift_info
        } catch (e) {
            return null
        }
    }

    async _get_room_uid() {
        let opt = {
            url: `http://m.longzhu.com/${this._roomid}`,
            timeout: REQUEST_TIMEOUT,
            json: true,
            gzip: true,
            agent: this._agent
        }
        try {
            let body = await request(opt)
            if (!body) {
                return null
            }
            let uid_array = body.match(/var roomId = (\d+);/)
            if (!uid_array) return null
            return uid_array[1]
        } catch (e) {
            return null
        }
    }


    async start() {
        if (this._starting) return
        this._starting = true
        if (!this._uid) {
            this._uid = await this._get_room_uid()
            if (!this._uid) {
                this.emit('error', new Error('Fail to get room id'))
                return this.emit('close')
            }
        }
        if (!this._gift_info) {
            this._gift_info = await this._get_gift_info()
            if (!this._gift_info) {
                this.emit('error', new Error('Fail to get gift info'))
                return this.emit('close')
            }
        }
        this._refresh_gift_info_timer = setInterval(this._refresh_gift_info.bind(this), REFRESH_GIFT_INFO_INTERVAL);
        this._start_ws_chat()
        this._start_ws_other()
    }

    async _refresh_gift_info() {
        let gift_info = await this._get_gift_info()
        if (gift_info) {
            this._gift_info = gift_info
        } else {
            this.emit('error', new Error('Fail to get gift info'))
        }
    }

    _start_ws_chat() {
        this._client_chat = new ws(`ws://mbgows.plu.cn:8805/?room_id=${this._uid}&batch=1&group=0&connType=1`, {
            perMessageDeflate: false,
            agent: this._agent
        })
        this._client_chat.on('open', () => {
            this.emit('connect')
        })
        this._client_chat.on('error', err => {
            this.emit('error', err)
        })
        this._client_chat.on('close', () => {
            this._stop()
            this.emit('close')
        })
        this._client_chat.on('message', this._on_msg.bind(this))
    }

    _start_ws_other() {
        this._client_other = new ws(`ws://mbgows.plu.cn:8805/?room_id=${this._uid}&batch=1&group=0&connType=2`, {
            perMessageDeflate: false,
            agent: this._agent
        })
        this._client_other.on('open', () => {
            this.emit('connect')
        })
        this._client_other.on('error', err => {
            this.emit('error', err)
        })
        this._client_other.on('close', () => {
            this._stop()
            this.emit('close')
        })
        this._client_other.on('message', this._on_msg.bind(this))
    }

    _on_msg(msg) {
        try {
            msg = JSON.parse(msg)
            if (msg instanceof Array) {
                msg.forEach((m) => {
                    this._format_msg(m)
                })
            } else {
                this._format_msg(msg)
            }
        } catch (e) {
            this.emit('error', e)
        }
    }

    _format_msg(msg) {
        let msg_obj, time
        try {
            let time_array = msg.msg.time.match(/Date\((\d+)/)
            time = parseInt(time_array[1])
        } catch (e) {
            time = new Date().getTime()
        }
        switch (msg.type) {
            case 'chat':
                let plat = 'pc_web'
                if (msg.msg.via === 2) {
                    plat = 'android'
                } else if (msg.msg.via === 3) {
                    plat = 'ios'
                }
                msg_obj = {
                    type: 'chat',
                    time: time,
                    from: {
                        name: msg.msg.user.username,
                        rid: msg.msg.user.uid + '',
                        level: msg.msg.user.newGrade,
                        plat: plat
                    },
                    content: msg.msg.content,
                    id: msg.id + '',
                    raw: msg
                }
                break;
            case 'gift':
                let gift = this._gift_info[msg.msg.itemType] || {}
                let gift_name = gift.name || '未知礼物'
                let gift_price = gift.price || 0
                let gift_type = gift.type || '未知类型'
                msg_obj = {
                    type: 'gift',
                    time: time,
                    name: gift_name,
                    from: {
                        name: msg.msg.user.username,
                        rid: msg.msg.user.uid,
                        level: msg.msg.user.newGrade,
                    },
                    count: msg.msg.number,
                    price: msg.msg.number * gift_price,
                    earn: msg.msg.number * gift_price * 0.01,
                    gift_type: gift_type,
                    id: msg.id + '',
                    raw: msg
                }
                break
            default:
                msg_obj = {
                    type: 'other',
                    time: time,
                    id: msg.id + '',
                    raw: msg
                }
                break;
        }
        this.emit('message', msg_obj)
    }

    _stop() {
        if (this._starting) {
            this._starting = false
            clearInterval(this._refresh_gift_info_timer)
            this._client_chat && this._client_chat.terminate()
            this._client_other && this._client_other.terminate()
        }
    }

    stop() {
        this.removeAllListeners()
        this._stop()
    }

}



const roomid = 'xuxubaobao'
const client = new longzhu_danmu(roomid)

function ListenRoom(roomarr) {
    this.clients = [];
    this.roomarr =roomarr;
    this.temp = [];
}
ListenRoom.prototype.start= function(){
    this.roomarr.forEach((element,index)=>{
        this.clients[index] = new longzhu_danmu(element);
        this.clients[index].on('message',msg=>{if(msg.type==="chat")this.save(msg)});
        this.clients[index].on('error',e=>{console.log('error',e);this.clients[index].start()});
        this.clients[index].start();     
        setInterval(() => {         
            for(let index in this.temp){
                addDanmu(this.temp[index])
            }
            this.temp = [];
        }, 45000);           
    })
    
}
ListenRoom.prototype.save = function(msg){
    this.temp.push([msg.raw.msg.RoomId,msg.from.rid,msg.from.name,msg.content,msg.time])
}

module.exports = ListenRoom;
