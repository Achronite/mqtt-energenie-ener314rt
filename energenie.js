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
    console.log("energenie: received command:", msg);
    switch (msg.cmd) {
        case 'init':
        case 'reset':
            // Normally we initialise automatically anyway, this is a forced reset
            console.log("energenie: reset");
            process.send({ cmd: "initialised" })
            break;
        case 'send':
            //console.log("energenie: Sending:", msg.payload);
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
                                console.log(`energenie: openThingsSwitch(${productId}, ${deviceId}, ${switchState}, ${xmits}) returned ${res}`);// monitoring loop should respond for us
                            } else {
                                console.log(`EMULATION: calling openThingsSwitch( ${productId}, ${deviceId}, ${switchState}, ${xmits})`);
                                // for emulation mode we need to respond, otherwise monitoring loop will do it for us
                                msg.emulated = true;
                                msg.state = switchState;
                                process.send(msg);                                
                            }                     

                            break;
                        case MIHO013:  //eTRV
                            if (initialised){
                                //var res = ener314rt.openThingsSwitch(productId, deviceId, switchState, xmits);
                                console.log(`energenie: TRV command (${productId}, ${deviceId}, ${switchState}, ${xmits}) returned ${res}`);// monitoring loop should respond for us
                            } else {
                                console.log(`EMULATION: not implemented for eTRV`);
                                // for emulation mode we need to respond, otherwise monitoring loop will do it for us                           
                            }  
                            break;
                        
                    }

                    break;

                default:
                    // Unknown message mode //
            }

            break;
            
        case 'monitor':
            //console.log("energenie: monitor enabled=", msg.enabled);
            if (msg.enabled){
                // start monitoring thread (if not started already)
                if (!monitoring && initialised) {
                    monitoring = true;
                    //getMonitorMsg();
                    startMonitoringThread();
                    console.log("energenie: Monitoring thread started");
                } else if (!initialised){
                    console.log("energenie: Monitoring thread cannot be started, ENER314-RT unavailable");
                } 
            }
            break;
        case 'close':
            console.log("energenie: closing");
            ener314rt.closeEner314rt();
            process.exit();
        case 'cacheCmd':
            if (msg.data === undefined || msg.data === null){
                msg.data = 0;
            }
            var res = ener314rt.openThingsCacheCmd(msg.deviceId, msg.otCommand, msg.data);
            if (res == 0){
                // Notify caching or cancel succesful
                if (msg.otCommand > 0){
                    msg.retries = 10;
                } else {
                    msg.retries = 0;
                }
                process.send(msg);
            }
            console.log(`energenie: cached cmd=${msg.otCommand} res=${res}`);
            break;
        case 'discovery':
            // Update the MQTT discovery topics after requesting devicelist
            var response = ener314rt.openThingsDeviceList(msg.scan);
            var discovery = JSON.parse(response);
            //console.log(`energenie.js: discovery returned: ${response}`);
            msg.numDevices = discovery.numDevices;
            msg.devices = discovery.devices;
            process.send(msg);
            break;
        default:
            console.log("energenie: Unknown or missing command:", msg.cmd);
    }
});

// monitor thread version in ener314rt uses a callback to return monitor messages directly (collected below), it needs the callback passing in
function startMonitoringThread() {
    ener314rt.openThingsReceiveThread(10000, (msg) => {
        //console.log(`asyncOpenThingsReceive ret=${ret}`);
        console.log(`energenie: monitor received=${msg}`);
        var OTmsg = JSON.parse(msg);
        OTmsg.cmd = 'monitor';
        process.send(OTmsg);
    });
};

// Initialise
//console.log("energenie: Initialising adaptor");
var ret = ener314rt.initEner314rt(false);
if (ret==0){
    initialised = true;
    console.log(`energenie: ENER314-RT initialised succesfully.`);
} else {
    console.log(`energenie ERROR: failed to initialise ENER314-RT ${ret}, EMULATION mode enabled`);
}
