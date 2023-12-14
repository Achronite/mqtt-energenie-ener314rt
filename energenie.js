//
// This is the async energenie child node program with 2-way comms to not block parent node.js in any way
//
// This is designed to handle all the Rx & Tx requests, it communicates with the parent using process.on & process.send
//
// @Achronite - January 2023
//
"use strict";

// logging framework
var log = require('npmlog');
log.heading = 'mqtt-energenie';

// log level should be command parameter
log.level = process.argv[2];
if (log.level === undefined || log.level === null){
    log.level = 'error';
}

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

log.info("energenie", "child process started");

// Handle signals cleanly
process.once('SIGINT', handleSignal);
process.once('SIGABRT', handleSignal);
process.once('SIGTERM', handleSignal);
process.once('SIGHUP', handleSignal);

var events = require('events');
this.events = new events.EventEmitter();

// import my dependant node.js module
var ener314rt = require('energenie-ener314rt');

// main processing section that does stuff when asked by parent
process.on('message', msg => {
    log.verbose("energenie","cmd: %j", msg);
    switch (msg.cmd) {
        case 'init':
        case 'reset':
            // Normally we initialise automatically anyway, this is a forced reset
            process.send({ cmd: "initialised" })
            break;
        case 'send':
            // Check xmit times (advanced), 26ms per payload transmission
            var xmits = Number(msg.repeat) || 20;
            let switchState = Boolean(msg.switchState);

            switch (msg.mode) {
                case 'ook':
                case 'OOK':
                    // Check and set parameters
                    let zone = Number(msg.zone);
                    if (zone < 0 || zone > 1048575 || isNaN(zone)) {
                        log.warn("energenie", "zone err: %j + (%j)",msg.zone, typeof(msg.zone));
                        break;
                    }

                    let switchNum = Number(msg.switchNum);
                    if (switchNum < 0 || switchNum > 6 || isNaN(switchNum)) {
                        log.warn("energenie", "switchNum not 0-6: %j + (%j)", msg.switchNum, typeof(msg.switchNum));
                        break;
                    }

                    // Invoke C function to do the send
                    if (initialised){
                        var ret = ener314rt.ookSwitch(zone, switchNum, switchState, xmits);
                        // ignore ret as workaround for https://github.com/Achronite/energenie-ener314rt/issues/32
                        msg.state = switchState;
                    } else {
                        log.verbose('emulator',"calling ookSwitch( %d, %d, %s, %d )", zone, switchNum, switchState, xmits);
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
                        log.warn("energenie", "ERROR: deviceId err: %j (%j)", msg.deviceId, typeof(msg.deviceId));
                        break;
                    }
                    switch (productId){
                        case MIHO005:   //Adapter+
                            // switch only device, call specifc function for this
                            // Invoke C function to do the send
                            if (initialised){
                                var res = ener314rt.openThingsSwitch(productId, deviceId, switchState, xmits);
                                log.verbose("energenie", "openThingsSwitch(%d,%d,%j,%d) returned %j",productId, deviceId, switchState, xmits, res);// monitoring loop should respond for us
                            } else {
                                log.verbose('emulator',"simulate calling openThingsSwitch(%d,%d,%j,%d)",productId, deviceId, switchState, xmits);
                                // for emulation mode we need to respond, otherwise monitoring loop will do it for us
                                msg.emulated = true;
                                msg.state = switchState;
                                process.send(msg);                                
                            }                     

                            break;
                        case MIHO069:  //Thermostat
                            if (initialised){
                                log.warn("energenie", "unable to send immediate command to thermostat, use cacheCmd instead");
                            } else {
                                log.verbose('emulator',"not implemented for thermostat");
                                // for emulation mode we need to respond, otherwise monitoring loop will do it for us                           
                            }            

                            break;
                        case MIHO013:  //eTRV
                            if (initialised){
                                log.warn("energenie", "unable to send immediate command to eTRV, use cacheCmd instead");
                            } else {
                                log.verbose('emulator',"not implemented for eTRV");
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
            if (msg.enabled){
                // start monitoring thread (if not started already)
                if (!monitoring && initialised) {
                    monitoring = true;
                    //getMonitorMsg();
                    startMonitoringThread();
                    log.info("energenie","monitoring thread started");
                } else if (!initialised){
                    log.warn("energenie","monitoring thread cannot be started, ENER314-RT unavailable");
                } 
            }
            break;
        case 'close':
            log.info("energenie","closing");
            ener314rt.closeEner314rt();
            process.exit(0);
        case 'cacheCmd':
            // Queue a cached command (usually for eTRV or Thermostat)
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
            log.verbose("energenie","cached deviceId=%d, cmd=%j, data=%j, res=%d", msg.deviceId, msg.otCommand, msg.data, res);
            break;
        case 'discovery':
            // Update the MQTT discovery topics after requesting devicelist
            var response = ener314rt.openThingsDeviceList(msg.scan);
            var discovery = JSON.parse(response);
            msg.numDevices = discovery.numDevices;
            msg.devices = discovery.devices;
            process.send(msg);
            break;
        default:
            log.info("energenie", "Unknown or missing command: %j", msg.cmd);
    }
});

// Crude error handler - Handle uncaught exceptions - exit process cleanly
process.on('uncaughtException', error => {
    log.error("energenie", "uncaughtException: %j, kill(%d,SIGABT)",process.pid,error);   
    process.kill(process.pid, "SIGABRT");
});


// Use single function to handle signals - assume all will close down
function handleSignal(signal) {
    if (initialised){
        if (monitoring) {
            log.info("energenie", "signal %j, closing adaptor and monitoring thread...", signal);
            ener314rt.stopMonitoring();

            // Allow time for monitor thread to complete after config.timeout and close properly, do this as a cb to not block main event loop
            setTimeout(function () {
                ener314rt.closeEner314rt();
                initialised = false;
                monitoring = false;
                log.info("energenie", "done - %j, exit(3)", signal);
                process.exit(3);
            }, 10000);
        
        } else {
            // no monitoring close immediately
            log.info("energenie", "signal %j, closing adaptor...", signal);
            ener314rt.closeEner314rt();
            initialised = false;
            monitoring = false;
            log.info("energenie", "done - %j, exit(2)", signal);
            process.exit(2);        
        }
    } else {
        // not even initialised yet!
        log.error("energenie", "signal handler not initialised, signal %j, exiting", signal );
        process.exit(1); }

};

// monitor thread version in ener314rt uses a callback to return monitor messages directly (collected below), it needs the callback passing in
function startMonitoringThread() {
    ener314rt.openThingsReceiveThread(10000, (msg) => {
        log.verbose("energenie", "received=%j", msg);
        var OTmsg = JSON.parse(msg);
        OTmsg.cmd = 'monitor';
        process.send(OTmsg);
    });
};

// Initialise
var ret = ener314rt.initEner314rt(false);
if (ret==0){
    initialised = true;
    log.info("energenie", "ENER314-RT initialised succesfully");
} else {
    log.warn("energenie", "failed to initialise ENER314-RT, err=%j, EMULATOR mode enabled",ret);
}
