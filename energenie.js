//
// This is the async energenie child node program with 2-way comms to not block parent node.js in any way
//
// This is designed to handle all the Rx & Tx requests, it communicates with the parent using process.on & process.send
//
// @Achronite - January 2023
//
"use strict";

var path = require('path');
let monitoring = false;
let initialised = false;

// OpenThings Device constants
const MIHO004 = 1;
const MIHO005 = 2;
const MIHO006 = 5;
const MIHO013 = 3;
const MIHO032 = 12;
const MIHO033 = 13;
const MIHO069 = 18;
//const MIHO089|MiHome Click - Smart Button|?|No|Yes||

var events = require('events');
this.events = new events.EventEmitter();

// import my dependant node.js module
var ener314rt = require('energenie-ener314rt');

// main processing section that does stuff when asked by parent
process.on('message', msg => {
    console.log("child: Message from parent:", msg);
    switch (msg.cmd) {
        case 'init':
        case 'reset':
            // Normally we initialise automatically anyway, this is a forced reset
            console.log("child: reset");
            process.send({ cmd: "initialised" })
            break;
        case 'send':
            //console.log("child: Sending:", msg.payload);
            // Check xmit times (advanced), 26ms per payload transmission
            var xmits = Number(msg.repeat) || 20;
            let switchState = Boolean(msg.switchState);

            switch (msg.mode) {
                case 'ook':
                case 'OOK':
                    // Check and set parameters
                    let zone = Number(msg.zone);
                    if (zone < 0 || zone > 1048575 || isNaN(zone)) {
                        console.log("ERROR: zone err: " + msg.zone + " (" + typeof (msg.zone) + ")");
                        break;
                    }

                    let switchNum = Number(msg.switchNum);
                    if (switchNum < 0 || switchNum > 6 || isNaN(switchNum)) {
                        console.log("ERROR: SwitchNum not 0-6: " + msg.switchNum + " (" + typeof (msg.switchNum) + ")");
                        break;
                    }

                    // Invoke C function to do the send
                    if (initialised){
                        var ret = ener314rt.ookSwitch(zone, switchNum, switchState, xmits);
                        if (ret == 0){
                            msg.state = switchState;
                        }
                    } else {
                        console.log("EMULATION: calling ookSwitch(", zone, ",", switchNum, ",", switchState,",", xmits,")");
                        msg.emulated = true;
                        msg.state = switchState;
                    }

                    // return result to parent
                    process.send(msg);

                    break;
                case 'fsk':
                case 'FSK':
                    // Check and set parameters
                    let productId = Number(msg.productId);

                    let deviceId = Number(msg.deviceId);
                    if (deviceId < 0 || isNaN(deviceId)) {
                        console.log("ERROR: deviceId err: " + msg.deviceId + " (" + typeof (msg.deviceId) + ")");
                        break;
                    }
                    switch (productId){
                        case MIHO005:   //Adapter+
                            // switch only device, call specifc function for this
                            // Invoke C function to do the send
                            if (initialised){
                                var res = ener314rt.openThingsSwitch(productId, deviceId, switchState, xmits);
                                // monitoring loop should respond for us
                            } else {
                                console.log(`EMULATION: calling openThingsSwitch( ${productId}, ${deviceId}, ${switchState}, ${xmits})`);
                                // for emulation mode we need to respond, otherwise monitoring loop will do it for us
                                msg.emulated = true;
                                msg.state = switchState;
                                process.send(msg);                                
                            }                     

                            break;
                        case MIHO013:  //eTRV
                                break;
                        
                    }

                    break;

                default:
                    // Unknown message mode //
            }

            break;
            
        case 'monitor':
            // start monitoring (if not started already)
            console.log("child: monitor enabled=", msg.enabled);
            if (!monitoring && initialised) {
                monitoring = true;
                //getMonitorMsg();
                startMonitoringThread();
                console.log("child: Monitoring thread started");
            } else {
                console.log("EMULATION: Monitoring thread cannot be enabled in EMULATION mode");
            }
            break;
        case 'close':
            console.log("child: closing");
            ener314rt.closeEner314rt();
            process.exit();
        case 'cacheCmd':
            if (msg.data === undefined || msg.data === null){
                msg.data = 0;
            }
            var res = ener314rt.openThingsCacheCmd(msg.deviceId, msg.otCommand, msg.data);
            console.log(`child: otCC cmd=${msg.otCommand} res=${res}`);
            break;
        default:
            console.log("child: Unknown or missing command:", msg.cmd);
    }
});

// monitor mode - non-async version - this works, but does seem to use the main thread loop
// TODO: async version
//
/*
function getMonitorMsg() {
    do {
        var msg = ener314rt.openThingsReceive(true);
        console.log("child: otR complete");
        //scope.log(`received ${msg}`);

        // msg returns -ve int value if nothing received, or a string
        if (typeof (msg) === 'string' || msg instanceof String) {
            // inform the parent that we have a message
            var OTmsg = JSON.parse(msg);
            process.send(OTmsg);
        } else {
            // no message
        }
    } while (monitoring);
};
*/


// monitor thread version in ener314rt uses a callback to return monitor messages directly (collected below), it needs the callback passing in
function startMonitoringThread() {
    ener314rt.openThingsReceiveThread(10000, (msg) => {
        //console.log(`asyncOpenThingsReceive ret=${ret}`);
        console.log(`child: received=${msg}`);
        var OTmsg = JSON.parse(msg);
        OTmsg.cmd = 'monitor';
        process.send(OTmsg);
    });
};

// Initialise
console.log("child: Initialising");
var ret = ener314rt.initEner314rt(false);
if (ret==0){
    initialised = true;
    console.log(`child: ENER314-RT initialised succesfully.`);
} else {
    console.log(`ERROR: child N-API radio_init returned ${ret}, EMULATION mode enabled`);
}
// simulate random Rx
/*
setInterval(() => {
    process.send({ payload: counter++ });
}, 4000);
*/