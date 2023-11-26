// mqtt-energenie-ener314rt app.js
//
// Copyright Achronite 2023
//

const APP_VERSION = (require('./package.json')).version;

// Add one console.log entry to show we are alive, the rest are configurable by npmlog
console.log(`mqtt-energenie-ener314rt version ${APP_VERSION}: starting`);

// logging framework
var log = require('npmlog');

// import config from file
const CONFIG = require('./config.json');

// setup logging level from config (use http as default if not configured)
log.heading = 'mqtt-ener314rt';
if (CONFIG.log_level)
	log.level = CONFIG.log_level
else
	log.level = 'http'

const MQTT_SUBTOPIC = CONFIG.topic_stub + "+/+/+/command";
const MQTTM_DEVICE = 1;
const MQTTM_OOK_ZONE = 2;
const MQTTM_OOK_SWITCH = 3;
const MQTTM_OT_PRODUCTID = 1;
const MQTTM_OT_DEVICEID = 2;
const MQTTM_OT_CMD = 3;

// OpenThings Commands
const CANCEL			= 1;    // replace with 0 before sending
const EXERCISE_VALVE 	= 163;
const LOW_POWER_MODE 	= 164;
const VALVE_STATE 		= 165;
const DIAGNOSTICS 		= 166;
const IDENTIFY			= 191;
const TARGET_TEMP 		= 244;
const VOLTAGE 			= 226;
const REPORTING_INTERVAL= 210;
const THERMOSTAT_MODE   = 170;  // Thermostat
const SWITCH_STATE    	= 243;

// import dependencies
const MQTT = require('mqtt');
var fs = require('fs');

// import my dependant node.js module
var ener314rt = require('energenie-ener314rt');

// import async processing for handling radio comms (pass in log level)
const { fork } = require('child_process');

var discovery = false;
var shutdown = false;

// setup signal error handling
process.on('SIGINT', handleSignal );
//process.on('SIGKILL', handleSignal );

// read xmit defaults from config file
let ook_xmits = 20;
let fsk_xmits = 20;
if (CONFIG.ook_xmits)
	ook_xmits = CONFIG.ook_xmits;
if (CONFIG.fsk_xmits)
	fsk_xmits = CONFIG.fsk_xmits;

// Set a default value for enable_volt_freq if it's missing from the config file
if (typeof CONFIG.enable_volt_freq === 'undefined') {
    CONFIG.enable_volt_freq = false; // Set to false by default
}

// connect to MQTT
log.info('MQTT', "connecting to broker %s", CONFIG.mqtt_broker);

// Add last will & testament message to set offline on disconnect
const availability_topic = `${CONFIG.topic_stub}availability/state`
var mqtt_options = CONFIG.mqtt_options;
mqtt_options.will = { topic: availability_topic,  payload: 'offline', retain: true };

var client = MQTT.connect(CONFIG.mqtt_broker,mqtt_options);

// when MQTT is connected...
client.on('connect',function(){	
	log.verbose('MQTT', "connected to broker %j", CONFIG.mqtt_broker);
	log.verbose('MQTT', "config: %j",mqtt_options);

	// Subscribe to incoming commands
	var options={
		retain:true,
		qos:0};
	
	var cmd_topic= MQTT_SUBTOPIC;
	client.subscribe(cmd_topic,options, function( err ) {
		if (!err){
			log.info('MQTT', "subscribed to %s", cmd_topic);
		} else {
			log.error('MQTT', "unable to subscribe to '%s'", cmd_topic);
		}
	});

	// set availability to online (offline is handled by LWT - see .connect )
	log.http('MQTT', "setting availability topic %s to 'online'", availability_topic);
	client.publish(availability_topic, 'online', { retain: true });

	// Enable Periodic MQTT discovery at 1 min, and then every 10 minutes
	if (CONFIG.discovery_prefix) {
		discovery = true;
		log.info('discovery', "discovery enabled at topic prefix '%s'", CONFIG.discovery_prefix);
		// After 1 min update MQTT discovery topics
		setTimeout(  UpdateMQTTDiscovery, (60 * 1000));
	
		// Every 10 minutes update MQTT discovery topics
		doDiscovery = setInterval(  UpdateMQTTDiscovery, (600 * 1000));
	} else {
		log.warn('discovery', "discovery disabled");
	}

})

//handle incoming MQTT messages
client.on('message', function (topic, msg, packet) {
	// format command for passing to energenie process
	// format is OOK: 'energenie/c/ook/zone/switchNum/command' or OT: 'energenie/c/2/deviceNum/command'
	log.verbose('>',"%s: %s", topic, msg);
	const cmd_array = topic.split("/");

	switch (cmd_array[MQTTM_DEVICE]) {
		case 'ook':
		case 'OOK':
		case 'o':
			// All ook 1-way devices
			
			// Is this request for a dimmer switch?
			if (cmd_array[MQTTM_OOK_SWITCH] == "dimmer"){
                /*
                 translate the brightness level into a switch number with on/off value, where the dimmer switch expects the following inputs
				  'OFF': Channel 1 off: Turn off
				   'ON': Channel 1 on: Switch on at the previous light level set  (not used by Home Assistant)
                    '2': Channel 2 on: Set dimmer to 20% (turn on at 20% if off)
                    '3': Channel 3 on: Set dimmer to 30% (turn on at 30% if off)
                    '4': Channel 4 on: Set dimmer to 40% (turn on at 40% if off)
                    '5': Channel 1 off: Set dimmer to 50% (turn on at 50% if off)
                    '6': Channel 2 off: Set dimmer to 60% (turn on at 60% if off)
                    '8': Channel 3 off: Set dimmer to 80% (turn on at 80% if off)
                   '10': Channel 4 off: Set dimmer to 100% (turn on at 100% if off)
                */

				// default dimmer OFF
				var switchNum = 1;
				var switchState = false;

				var brightness = String(msg);

				// Brightness steps vary
				switch (brightness) {
					case 'OFF':
					case '0':
						// off
						break;
					case 'ON':		// unused by Home Assistant as it should send brightness
						switchState = true;
						break;
					case '1':
					case '2':
						switchNum = 2;
						switchState = true;
						break;
					case '3':
						switchNum = 3;
						switchState = true;
						break;
					case '4':
						switchNum = 4;
						switchState = true;
						break;
					case '5':
					case '6':						
						switchNum = 2;
						switchState = false;
						break;
					case '7':
					case '8':
						switchNum = 3;
						switchState = false;
						break;
					case '9':
					case '10':
						switchNum = 4;
						switchState = false;
						break;
					default:
						log.warn('>', "Invalid brightness %s for %j", brightness, cmd_array[MQTTM_OOK_ZONE]);
						return;
                } // switch
				var ener_cmd = { cmd: 'send', mode: 'ook', repeat: ook_xmits, brightness: brightness, zone: cmd_array[MQTTM_OOK_ZONE], switchNum: switchNum, switchState: switchState };

			} else {
				//validate standard on/off request, default to OFF
				var switchState = false;
				if (typeof msg == typeof true)
					switchState = msg;
				else if (msg == "ON" || msg == "on" || msg == 1 || msg == '1')
					switchState = true;
				var ener_cmd = { cmd: 'send', mode: 'ook', repeat: ook_xmits, zone: cmd_array[MQTTM_OOK_ZONE], switchNum: cmd_array[MQTTM_OOK_SWITCH], switchState: switchState };
			}
			break;
		case '2':
		case 2:
			// MIHO005 - Adaptor+

			//validate on/off request, default to OFF
			var switchState = false;
			if (typeof msg == typeof true)
				switchState = msg;
			else if (msg == "ON" || msg == "on" || msg == 1 || msg == '1')
				switchState = true;
			var ener_cmd = {
				cmd: 'send', mode: 'fsk', repeat: fsk_xmits, command: 'switch',
				productId: cmd_array[MQTTM_OT_PRODUCTID],
				deviceId: cmd_array[MQTTM_OT_DEVICEID],
				switchState: switchState
			};
			break;
		case '3':
		case 3:
			var otCommand = 0;
			// MIHO013 - Smart Radiator Valve
			//
			// TODO: Check data values (msg) passed in is valid for the command

			/* Valid Commands:
				163 EXERCISE_VALVE 	   	(DIAGNOSTICS)
				164 SET_LOW_POWER_MODE	(DIAGNOSTICS)
				165 SET_VALVE_STATE 	Set valve state 0=Open, 1=Closed, 2=Auto
				166 DIAGNOSTICS 		(DIAGNOSTICS)
				191 IDENTIFY
				210 REPORTING_INTERVAL	300-3600 seconds
				226 REQUEST_VOLTAGE 	Report current voltage of the batteries (VOLTAGE)
				TEMP_SET
			*/

			let stateTopic = null;
			let msg_data = Number(msg);

			// Convert OpenThings Cmd String to Numeric
			switch (cmd_array[MQTTM_OT_CMD]) {
				case 'Maintenance':
					// Special select processing from Home Assistant built for the eTRV
					// The idea here is to translate the maintenance commands into OpenThings Commands
					msg_data = 0;
					switch (String(msg)) {
						case 'None':
							// ignore select 'None'
							return;
						case 'Cancel Command':
							otCommand = CANCEL;
							break;
						case 'Request Diagnostics':
							otCommand = DIAGNOSTICS;
							break;
						case 'Exercise Valve':
							otCommand = EXERCISE_VALVE;
							break;
						case 'Identify':
							otCommand = IDENTIFY;
							break;
						case 'Low Power Mode ON':
							otCommand = LOW_POWER_MODE;
							msg_data = 1;
							break;
						case 'Low Power Mode OFF':
							otCommand = LOW_POWER_MODE;
							msg_data = 0;
							break;
						case 'Valve Auto':
							otCommand = VALVE_STATE;
							msg_data = 2;
							break;
						case 'Valve Open':
							otCommand = VALVE_STATE;
							msg_data = 0;
							break;
						case 'Valve Closed':
							otCommand = VALVE_STATE;
							msg_data = 1;
							break;
						case 'Request Voltage':
							otCommand = VOLTAGE;
						default:
							log.warn('cmd', "Unsupported Maintenance command: %j type:%j for eTRV", msg, typeof(msg));
					}  // msg
					break;

				case 'TARGET_TEMP':
					otCommand = TARGET_TEMP;
					break;
				case 'VOLTAGE':
					otCommand = VOLTAGE;
					break;
				case 'EXERCISE_VALVE':
					otCommand = EXERCISE_VALVE;
					// Clear existing result in MQTT
					stateTopic = topic.replace("command", "state");
					log.verbose('<', "%s: null (retained)", stateTopic);
					client.publish(stateTopic, undefined, { retain: true });
					break;
				case 'LOW_POWER_MODE':
					otCommand = LOW_POWER_MODE;
					break;
				case 'VALVE_STATE':
					otCommand = VALVE_STATE;
					break;
				case 'DIAGNOSTICS':
					otCommand = DIAGNOSTICS;
					// Clear existing DIAGNOSTICS in MQTT
					stateTopic = topic.replace("command", "state");
					log.verbose('<', "%s: null (retained)", stateTopic);
					client.publish(stateTopic, undefined, { retain: true });
					break;
				case 'REPORTING_INTERVAL':
					otCommand = REPORTING_INTERVAL;
					break;
				default:
					// unsupported command
					log.warn('cmd', "Unsupported cacheCmd for eTRV: %j %j",cmd_array[MQTTM_OT_CMD], msg);
					return;
			} // switch 3: MQTTM_OT_CMD;

			if (otCommand > 0) {
				// We have a valid eTRV command

				// swap out CANCEL for 0
				if (otCommand == CANCEL ){
					otCommand = 0;
				} else {
					// Convert booleans from HA default (ON/OFF)
					if (typeof msg_data != typeof true) {
						if (msg_data == "ON" || msg_data == "on") {
							msg_data = 1;
						} else if (msg_data == "OFF" || msg_data == "off") {
							msg_data = 0;
						} else {
							// non-boolean, pass on as is
						}
					}
				}


				// All eTRV commands are cached
				var ener_cmd = {
					cmd: 'cacheCmd', mode: 'fsk', repeat: fsk_xmits,
					command: cmd_array[MQTTM_OT_CMD],
					productId: Number(cmd_array[MQTTM_OT_PRODUCTID]),
					deviceId: Number(cmd_array[MQTTM_OT_DEVICEID]),
					otCommand: otCommand,
					data: msg_data
				};
			} else {
				log.warn('cmd',"Invalid otCommand for eTRV: %j",otCommand);
			}
			break;

		case '18':
		case 18:
			var otCommand = 0;
			// MIHO069 - Smart Thermostat (alpha)

			msg_data = Number(msg);

			// Convert OpenThings Cmd String to Numeric
			switch (cmd_array[MQTTM_OT_CMD]) {
				case 'TARGET_TEMP':
					otCommand = TARGET_TEMP;
					break;
				case 'LOW_POWER_MODE':
					otCommand = LOW_POWER_MODE;
					break;
				case 'REPORTING_INTERVAL':
					otCommand = REPORTING_INTERVAL;
					break;
				case 'THERMOSTAT_MODE':
					otCommand = THERMOSTAT_MODE;
					break;				
				case 'SWITCH_STATE':
					otCommand = SWITCH_STATE;
					break;					
				default:
					// unsupported command
					log.warn('cmd', "Unsupported cacheCmd for Thermostat: %j %j",cmd_array[MQTTM_OT_CMD], msg);
					return;
			} // switch 3: MQTTM_OT_CMD;

			if (otCommand > 0) {
				// We have a valid eTRV command

				// swap out CANCEL for 0
				if (otCommand == CANCEL ){
					otCommand = 0;
				} else {
					// Convert booleans from HA default (ON/OFF)
					if (typeof msg_data != typeof true) {
						if (msg_data == "ON" || msg_data == "on") {
							msg_data = 1;
						} else if (msg_data == "OFF" || msg_data == "off") {
							msg_data = 0;
						} else {
							// non-boolean, pass on as is
						}
					}
				}


				// All Thermostat commands are cached
				var ener_cmd = {
					cmd: 'cacheCmd', mode: 'fsk', repeat: fsk_xmits,
					command: cmd_array[MQTTM_OT_CMD],
					productId: Number(cmd_array[MQTTM_OT_PRODUCTID]),
					deviceId: Number(cmd_array[MQTTM_OT_DEVICEID]),
					otCommand: otCommand,
					data: msg_data
				};
			} else {
				log.warn('cmd',"Invalid otCommand for eTRV: %j",otCommand);
			}
			break;

		default:
			// Undefined device
	} // switch MQTTM_DEVICE

	if (ener_cmd !== undefined) {
		// Send request to energenie process, any responses are handled by forked.on('message')
		log.http("command", "%j", ener_cmd);
		forked.send(ener_cmd);
	} else {
		log.warn('cmd',"Invalid MQTT device/command %j:%j",cmd_array[MQTTM_DEVICE],msg);
	}
});
  
//handle MQTT errors
client.on('error', function(error){
	if (!shutdown)
		log.error('MQTT',"ERROR %j connecting to MQTT broker: %j", error, CONFIG.mqtt_broker);
	process.exit(1)
});

//Report MQTT close
client.on('close',function(){
	log.warn('MQTT', "Disconnected from MQTT broker: %s", CONFIG.mqtt_broker);
	//process.exit(1)
});

// fork energenie process to handle all energenie Rx/Tx
const forked = fork("energenie.js", [log.level]);


forked.on("spawn", msg => {
	// process started succesfully, request start of the monitor loop if configured in config file
	if (CONFIG.monitoring){
		log.info("monitor", "starting monitoring of FSK devices...");
		forked.send({ cmd: "monitor", enabled: true });
	}
});
/*
** Handle monitor/results messages returned by energenie
*/
forked.on("message", msg => {
	// we have a monitor or ACK message, transform into MQTT message
    log.http("monitor","received: %j", msg);

	switch (msg.cmd){
		case 'send':
			var rtn_msg = "UNKNOWN";
			var state_topic;
			switch (msg.mode) {
				case 'ook':
					if (msg.brightness){
						// dimmer switch uses brightness instead of state: 1-10 (ON at Brightness) or OFF
						log.verbose('app', "dimmer: %j", msg);

						// use the value of dimmer instead of switchNum
						state_topic = `${CONFIG.topic_stub}ook/${msg.zone}/dimmer/state`;
						rtn_msg = String(msg.brightness);

					} else {
						state_topic = `${CONFIG.topic_stub}ook/${msg.zone}/${msg.switchNum}/state`;
						
						if (typeof(msg.state) === 'boolean'){
							if (msg.state) {
								rtn_msg = "ON";
							} else {
								rtn_msg = "OFF";
							}
						} else {
							log.error('app', "msg.state not boolean, type = %j", typeof(msg.state));
						}
					}
					// send response back via MQTT state topic, setting the retained flag to survive restart on client
					log.verbose('<', "%s: %s (retained)", state_topic, rtn_msg);
					client.publish(state_topic,rtn_msg,{retain: true});
					break;

				case 'fsk':
					// TODO allow for multiple parameters being returned
					state_topic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/${msg.command}/state`;
					
					if (typeof(msg.state) === 'boolean'){
						if (msg.state) {
							rtn_msg = "ON";
						} else {
							rtn_msg = "OFF";
						}
					} else {
						// only allows for single param, may need to change if using JSON
						rtn_msg = msg.state;
					}

					// send single response back via MQTT state topic
					log.verbose('<', "%s: %s", state_topic, rtn_msg);
					client.publish(state_topic,rtn_msg);

					break;
				
			} // switch 'send' msg.mode


			break;

		case 'monitor':
			// OpenThings monitor message

			let keys = Object.keys(msg);
			var productId = null;
			var deviceId = null;

			// Iterate through the object returned

			keys.forEach((key) => {
				let topic_key = key;
				let retain = false;;
				switch (key) {
					case 'productId':
					case 'deviceId':
					case 'mfrId':
					case 'cmd':
						// do not send via MQTT
						topic_key = null;
						break;
					case 'timestamp':
						// epoch to last_seen timestamp
						topic_key = 'last_seen';
						break;							
					case 'SWITCH_STATE':
						// use friendly name and value
						topic_key = 'switch';
						if (msg[key] == 1 || msg[key] == '1') {
							msg[key] = "ON";
						} else {
							msg[key] = "OFF";
						}

						break;
					case 'MOTION_DETECTOR':
						topic_key = 'motion';
						if (msg[key] == 1 || msg[key] == '1') {
							msg[key] = "ON";
						} else {
							msg[key] = "OFF";
						}
						break;
					case 'DOOR_SENSOR':
						topic_key = 'contact';
						if (msg[key] == 1 || msg[key] == '1') {
							msg[key] = "ON";
						} else {
							msg[key] = "OFF";
						}
						break;

					case 'LOW_POWER_MODE':
					case 'ERRORS':
						// other binary fields
						if (msg[key] == 1 || msg[key] == '1') {
							msg[key] = "ON";
						} else {
							msg[key] = "OFF";
						}
						break;
					case 'command':
						let cmdTxt = lookupCommand(msg[key]);
						log.verbose("monitor","lookupCommand(%s) returned %j",msg[key], cmdTxt);
						msg[key] = cmdTxt;
						break;
					case 'VALVE_STATE':
					case 'LOW_POWER_MODE':
					case 'REPORTING_INTERVAL':
					case 'TARGET_TEMP':
					case 'ERROR_TEXT':
						// These values need to be retained on MQTT as they are irregularly reported
						retain = true;
						break;
					case 'VOLTAGE':
					case 'BATTERY_LEVEL':
						let batteries = 0;
						// Voltage values are device specific
						switch(msg.productId){
							case 3:		// eTRV
								batteries = 2;
								retain = true;
								break;
							case 5:		// Energy Monitor
								batteries = 3;
								break;
							case 18:	// Future support for Thermostat
								batteries = 2;	
						}
						if (batteries > 0){
							// calculate battery % where applicable assuming alkaline batteries, calculations from internet ;)
							let v = msg[key]/batteries;
							let charge = 0;
							if (v >= 1.55){
								charge = 100;
							} else if (v < 1.1 ){
								charge = 0
							} else if (v < 1.18 ){
								charge = 5;
							} else {
								// use a simple linear equation for the rest (y=mx+c), based on 1.44v=90% and 1.2v=10%
								charge = (333.3*v) - 390;

								// Can produce high values at top end, restrict down
								if (charge>95){
									charge=95;
								}
								//charge = 9412 - 23449*(v/batteries) + 19240*(v*v/batteries) - 5176*(v*v*v/batteries); // cubic regression
							}
							
							// send addition battery percentage response back via MQTT state topic
							state_topic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/battery/state`;
							state = String(Math.round(charge));
							if (retain) {
								log.verbose('<', "%s: %s (retained)", state_topic, state);
								client.publish(state_topic,state,{retain: true});
							} else {
								log.verbose('<', "%s: %s", state_topic, state);
								client.publish(state_topic,state);
							}
						}

					case 'ALARM':
						// Translate suspected low battery alert to text
						if (msg[key] == 66 | msg[key] == '66'){
							// send low battery alert - NOT retained as this never clears
							msg[key] = "Low Battery";
						}

					default:
						// assume an unknown key we need to set in topic tree
				}

				// send MQTT response (state) if we have a valid topic string
				if (topic_key !== null && msg.productId !== undefined && msg.deviceId !== undefined) {
					state_topic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/${topic_key}/state`;
					state = String(msg[key]);

					// send response back via MQTT state topic
					if (retain) {
						log.verbose('<', "%s: %s (retained)", state_topic, state);
						client.publish(state_topic,state,{retain: true});
					} else {
						log.verbose('<', "%s: %s", state_topic, state);
						client.publish(state_topic,state);
					}

					// Update Maintenance if retries=0
					if (topic_key == "retries" && state == '0'){
						// retries are now empty, also change the Maintenance Select back to None
						state_topic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/Maintenance/state`;
						log.verbose('<', "%s: None", state_topic);
						client.publish(state_topic,"None");
					}
				};
			})

			break;
		case 'discovery':
			// device discovery message publish discovery messages to Home Assistant
			log.info('discovery', "found %i devices", msg.numDevices);
			msg.devices.forEach(publishDiscovery);
			break;

		case 'cacheCmd':
			// response from a cacheCmd, store the command (as text) and retries

			log.http('cached', "%j", msg);

			// send MQTT if we have a valid topic string
			if (msg.productId !== undefined && msg.deviceId !== undefined) {
				
				if (typeof(msg.retries) != "undefined") {
					state_topic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/retries/state`;
					state = String(msg.retries);
					// set retries on MQTT
					log.verbose('<', "%s: %s", state_topic, state);
					client.publish(state_topic,state);
				}
				
				if (typeof(msg.otCommand) != "undefined"){
					state_topic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/command/state`;
					state = String(lookupCommand(msg.otCommand));

					// save cached command on MQTT
					log.verbose('<', "%s: %s", state_topic, state);
					client.publish(state_topic,state);
				}

				// Store cached state for values that are NEVER returned by eTRV monitor messages (confirmed by energenie)
				if (msg.productId == 3 && msg.command == 'VALVE_STATE'){
					state_topic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/${msg.command}/state`;
					state = String(msg.data);

					// send response back via MQTT
					log.verbose('<', "%s: %s (optimistic retained)", state_topic, state);
					client.publish(state_topic,state,{retain: true});
				}
				
			};
			break;
		case 'init':
		case 'reset':
			break;
	} // switch msg.cmd

});

forked.on('close', (code, signal) => {
    log.warn('app', "closed due to terminated energenie process. code=%j, signal=%j", code, signal);
    // clear interval timer (causes program to exit as nothing left to do!)
    //clearInterval(doDiscovery);
	process.exit();
});

forked.on('exit', (code, signal) => {
    log.warn('app', "exit due to terminated energenie process. code=%j, signal=%j", code, signal);
    // clear interval timer (causes program to exit as nothing left to do!)
    //clearInterval(doDiscovery);
	process.exit();
});

function UpdateMQTTDiscovery() {
	if (discovery){
		log.info('auto', "calling discovery");
		forked.send({ cmd: "discovery", scan: false });
	}
}

// Each device has specific capabilities, which map to Home Assistant Components.
// This function publishes config items for these capabilities at @<discovery_prefix>/<component>/[<node_id>/]<object_id>/config
//
// Configuration of what values to publish is externalised to a file for each device product 'devices/<productId>.json'
//
function publishDiscovery( device, index ){

	log.info('discovery',"discovered: %j",device);

	if ( device.mfrId == 4){
		// energenie device

		// Read discovery config
		fs.readFile(`devices/${device.productId}.json`, (err, data) => {
			if (err) {
				log.error('discovery', "skipped for device %i - unknown device type 'devices/%j.json' missing", device.deviceId, device.productId);
			} else {
				device_defaults = JSON.parse(data);
				device_defaults.parameters.forEach( (parameter) => {
					//
					var object_id = `${device.deviceId}-${parameter.id}`;
					var unique_id = `ener314rt-${object_id}`;
					var entity_name = toTitleCase(parameter.id);
					var device_name = `${device_defaults.mdl} ${device.deviceId}`;

			
                    // Condition to check if CONFIG.monitoring is true and if the parameter component is 'FREQUENCY' or 'VOLTAGE'
					// Enables Frequency and Voltage reporting via MQTT discovery.
                    if (CONFIG.enable_volt_freq && (parameter.id == 'FREQUENCY' || parameter.id == 'VOLTAGE')) {
                        parameter.config.en = true;
                    }
/*
					if ((parameter.component == 'switch') ||
					   (parameter.component == 'binary_sensor' && (parameter.id == 'MOTION_DETECTOR' || parameter.id == 'DOOR_SENSOR') )) {
						// Shorten name for obvious parameters
						name = group_name;
					} else if (parameter.id == 'retries') {
						// pretty command retries
						name = `command retries`;
					} else {
						// Convert to prettier lowercase entity name without underscores
						name = `${parameter.id.toLowerCase().replace(/_/g, ' ')}`
					}
*/
					var discoveryTopic = `${CONFIG.discovery_prefix}${parameter.component}/ener314rt/${object_id}/config`;
//          var dmsg = Object.assign({ uniq_id: `${unique_id}`, "~": `${CONFIG.topic_stub}`, name: `${name}`, mf: 'energenie', sw: 'mqtt-ener314rt' },
					var dmsg = Object.assign({
						device: {
							name: `${device_name}`,
							ids: [`ener314rt-${device.deviceId}`],
							mdl: `${device_defaults.mdl} (${device_defaults.mdlpn}) [${device.deviceId}]`,
							mf: `Energenie`,
							sw: `mqtt-ener314rt ${APP_VERSION}`
						},
						uniq_id: `${unique_id}`,
						"~": `${CONFIG.topic_stub}${device.productId}/${device.deviceId}/`,
						name: `${entity_name}`,
						avty_t: `${CONFIG.topic_stub}availability/state`,
						o: {
							name: `mqtt-energenie-ener314rt`,
							sw: `${APP_VERSION}`,
							url: `https://github.com/Achronite/mqtt-energenie-ener314rt`
						}
					},
					parameter.config, );

					// replace @ in topics with the address where each of the data items are published (state) or read (command)
					if (parameter.stat_t){
						dmsg.stat_t = parameter.stat_t.replace("@", `${parameter.id}`);
					}

					if (parameter.cmd_t){
						dmsg.cmd_t = parameter.cmd_t.replace("@", `${parameter.id}`);
					}

					log.verbose('<', "discovery %s", discoveryTopic);
					client.publish(discoveryTopic,JSON.stringify(dmsg),{retain: true});

				})

			}

		});

		// TODO error handling

	}
}

function lookupCommand( cmd ){
	switch( Number(cmd) ){
		case 0:
			return 'None';
		case TARGET_TEMP:
			return 'Set Temperature';
		case EXERCISE_VALVE:
			return 'Exercise Valve';
		case LOW_POWER_MODE:
			return 'Low Power Mode';		
		case VALVE_STATE:
			return 'Valve Mode';
		case DIAGNOSTICS:
			return 'Diagnostics';
		case REPORTING_INTERVAL:
			return 'Interval';
		case IDENTIFY:
			return 'Identify';
		case VOLTAGE:
			return 'Voltage';
	};
	return cmd;
}

// Use single function to handle multiple signals
function handleSignal(signal) {
	shutdown = true;
	log.warn('app', "received %j signal", signal);

	// publish offline to MQTT (abnormal disconnects also set this via MQTT LWT)
	log.info('MQTT', "setting %s to 'offline'", availability_topic);
	client.publish(availability_topic, 'offline', { retain: true });
	log.info('app', "awaiting shutdown of energenie process...");

	// terminate discovery loop, and therefore the process
	if (discovery) {
		discovery = false;
		clearInterval(doDiscovery);
	}

	// Gracefully shutdown energenie process
	//forked.send({ cmd: "close" });

	//disconnect from MQTT
	client.end();

}

// Convert '_' delimited string to Title Case, replacing '_' with spaces
function toTitleCase(str) {
    let upper = false;
    let newStr = str[0].toUpperCase();
    for (let i = 1, l = str.length; i < l; i++) {
        if (str[i] == "_") {
            upper = true;
            newStr += ' ';
            continue;
        }
        newStr += upper ? str[i].toUpperCase() : str[i].toLowerCase();
        upper = false;
    }
    return newStr;
}
