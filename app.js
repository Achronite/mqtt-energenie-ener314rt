// mqtt-energenie-ener314rt app.js
//
// Copyright Achronite 2023
//

// import config from file
const CONFIG = require('./config.json');

//console.log(CONFIG);

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

const MQTT = require('mqtt');
var fs = require('fs');

// import my dependant node.js module
var ener314rt = require('energenie-ener314rt');

// import async processing for handling radio comms
const { fork } = require('child_process');

// setup signal error handling
process.on('SIGINT', handleSignal );
//process.on('SIGKILL', handleSignal );


// connect to MQTT
console.log(`INFO: connecting to MQTT broker: ${CONFIG.mqtt_broker}`);
var client = MQTT.connect(CONFIG.mqtt_broker,CONFIG.mqtt_options);
//console.log("connected flag  " + client.connected);

//handle incoming MQTT messages
client.on('message', function (topic, msg, packet) {
	console.log("> MQTT cmd topic=" + topic + ": " + msg);

	// format command for passing to energenie process
	// format is OOK: 'energenie/c/ook/zone/switchNum/command' or OT: 'energenie/c/2/deviceNum/command'
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
						console.log(`ERROR: Invalid brightness ${brightness} for ${cmd_array[MQTTM_OOK_ZONE]}`);
						return;
                } // switch
				var ener_cmd = { cmd: 'send', mode: 'ook', brightness: brightness, zone: cmd_array[MQTTM_OOK_ZONE], switchNum: switchNum, switchState: switchState };

			} else {
				//validate standard on/off request, default to OFF
				var switchState = false;
				if (typeof msg == typeof true)
					switchState = msg;
				else if (msg == "ON" || msg == "on" || msg == 1 || msg == '1')
					switchState = true;
				var ener_cmd = { cmd: 'send', mode: 'ook', zone: cmd_array[MQTTM_OOK_ZONE], switchNum: cmd_array[MQTTM_OOK_SWITCH], switchState: switchState };
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
				cmd: 'send', mode: 'fsk', command: 'switch',
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
							msg_data = true;
							break;
						case 'Low Power Mode OFF':
							otCommand = LOW_POWER_MODE;
							msg_data = false;
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
						default:
							console.log(`ERROR: Invalid Maintenance command: ${msg} type:${typeof(msg)}`);
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
					client.publish(stateTopic, undefined, { retain: true });
					break;
				case 'LOW_POWER_MODE':
					otCommand = LOW_POWER_MODE;
					break;
				case 'VALVE_STATE':
					otCommand = VALVE_STATE;
					// Convert valve state to numeric
					if (typeof (msg) != 'number') {
						switch (msg) {
							case 'Open':
								msg_data = 0;
								break;
							case 'Closed':
								msg_data = 1;
							case 'Auto':
							default:
								msg_data = 2;
						}
					}
					break;
				case 'DIAGNOSTICS':
					otCommand = DIAGNOSTICS;
					// Clear existing DIAGNOSTICS in MQTT
					stateTopic = topic.replace("command", "state");
					client.publish(stateTopic, undefined, { retain: true });
					break;
				case 'REPORTING_INTERVAL':
					otCommand = REPORTING_INTERVAL;
					break;
				default:
					// unsupported command
					console.log(`ERROR energenie: Unsupported cacheCmd: ${cmd_array[MQTTM_OT_CMD]} ${msg}`);
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
					cmd: 'cacheCmd', mode: 'fsk',
					command: cmd_array[MQTTM_OT_CMD],
					productId: Number(cmd_array[MQTTM_OT_PRODUCTID]),
					deviceId: Number(cmd_array[MQTTM_OT_DEVICEID]),
					otCommand: otCommand,
					data: msg_data
				};
			} else {
				console.log(`> ${otCommand}`);
			}
			break;

		default:
			// Undefined device
	} // switch MQTTM_DEVICE

	if (ener_cmd !== undefined) {
		// Send request to energenie process, any responses are handled by forked.on('message')
		console.log("> " + JSON.stringify(ener_cmd));
		forked.send(ener_cmd);
	} else {
		console.log(`ERROR: Invalid MQTT device/command ${cmd_array[MQTTM_DEVICE]}:${msg}`)
	}
});


/*
** When MQTT is connected, subscribe to the command topic(s)
*/
client.on('connect',function(){	
	console.log("INFO: MQTT connected to broker "+ CONFIG.mqtt_broker);

	// start the monitor loop if configured in config file
	if (CONFIG.monitoring){
		console.log("INFO: starting monitoring of FSK devices...")
		forked.send({ cmd: "monitor", enabled: true });
	}

	// Subscribe to incoming commands
	var options={
		retain:true,
		qos:0};
	
	var cmd_topic= MQTT_SUBTOPIC;
	//var cmd_topic="esphome/sensors/dht11/#";
	//console.log("subscribing to ",cmd_topic);
	client.subscribe(cmd_topic,options, function( err ) {
		if (!err){
			console.log(`INFO: MQTT subscribed to ${cmd_topic}`);
		} else {
			// error
		}
	});

	// Enable Periodic MQTT discovery at 1 min, and then every 10 minutes
	if (CONFIG.discovery_prefix) {
		console.log(`INFO: MQTT discovery enabled at topic '${CONFIG.discovery_prefix}'`);
		// After 1 min update MQTT discovery topics
		setTimeout(  UpdateMQTTDiscovery, (60 * 1000));
	
		// Every 10 minutes update MQTT discovery topics
		doDiscovery = setInterval(  UpdateMQTTDiscovery, (600 * 1000));
	} else {
		console.log("INFO: MQTT discovery disabled");
	}

})


//handle MQTT errors
client.on('error',function(error){
	console.log(`ERROR '${error}' connecting to MQTT broker: ${CONFIG.mqtt_broker}`);
	process.exit(1)
});


// fork energenie process to handle all energenie Rx/Tx
const forked = fork("energenie.js");

/*
** Handle monitor/results messages returned by energenie
*/
forked.on("message", msg => {
	// we have a monitor or ACK message, transform into MQTT message
    //console.log("Message from energenie process: ", msg);

	switch (msg.cmd){
		case 'send':
			var rtn_msg = "UNKNOWN";
			var state_topic;
			switch (msg.mode) {
				case 'ook':
					if (msg.brightness){
						// dimmer switch uses brightness instead of state: 1-10 (ON at Brightness) or OFF
						//console.log(`dimmer: ${JSON.stringify(msg)}`);

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
							console.log("ERROR: msg.state type = ", typeof(msg.state));
						}
					}
					// send response back via MQTT state topic, setting the retained flag to survive restart on client
					console.log(`< ${state_topic}: ${rtn_msg} (retained)`);
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
					console.log("< ", state_topic, ": ", rtn_msg);
					client.publish(state_topic,rtn_msg);

					break;
				
			} // switch 'send' msg.mode


			break;

		case 'monitor':
			// OpenThings monitor message, or return from cache request

			let keys = Object.keys(msg);
			var productId = null;
			var deviceId = null;

			// Iterate through the object returned

			keys.forEach((key) => {
				topic_key = null;
				//console.log(`key ${key}=${msg[key]}`);
				switch (key) {
					case 'productId':
					case 'deviceId':
					case 'mfrId':
					case 'timestamp':
					case 'cmd':
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
						topic_key = key;
						if (msg[key] == 1 || msg[key] == '1') {
							msg[key] = "ON";
						} else {
							msg[key] = "OFF";
						}
						break;
					case 'command':
						topic_key = key;
						let cmdTxt = lookupCommand(msg[key]);
						//console.log(`>>lookupCommand(${msg[key]}) returned ${cmdTxt}`);
						msg[key] = cmdTxt;
						break;
					default:
						// assume an unknown key we need to set in topic tree
						topic_key = key;							
				}

				// send MQTT response (state) if we have a valid topic string
				if (topic_key !== null && msg.productId !== undefined && msg.deviceId !== undefined) {
					state_topic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/${topic_key}/state`;
					state = String(msg[key]);

					// send response back via MQTT state topic
					console.log(`< ${state_topic}: ${state}`);
					client.publish(state_topic,state);

					// Update Maintenance if retries=0
					if (topic_key == "retries" && state == '0'){
						// retries are now empty, also change the Maintenance Select back to None
						state_topic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/Maintenance/state`;
						console.log(`< ${state_topic}: None`);
						client.publish(state_topic,"None");
					}

				};
			})

			break;
		case 'discovery':
			// device discovery message publish discovery messages to Home Assistant
			console.log(`INFO: discovery found ${msg.numDevices} devices`);
			msg.devices.forEach(publishDiscovery);
			break;

		case 'cacheCmd':
			// response from a cacheCmd, just store the command (as text) and retries

			console.log(`^ cached: ${JSON.stringify(msg)}`);

			// send MQTT if we have a valid topic string
			if (msg.productId !== undefined && msg.deviceId !== undefined) {
				
				if (typeof(msg.retries) != "undefined") {
					state_topic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/retries/state`;
					state = String(msg.retries);
					// send response back via MQTT
					console.log(`< ${state_topic}: ${state}`);
					client.publish(state_topic,state);
				}
				
				if (typeof(msg.otCommand) != "undefined"){
					state_topic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/command/state`;
					state = String(lookupCommand(msg.otCommand));

					// send response back via MQTT
					console.log(`< ${state_topic}: ${state}`);
					client.publish(state_topic,state);
				}
			};
			break;
		case 'init':
		case 'reset':
			break;
	} // switch msg.cmd

});

forked.on('close', (code, signal) => {
    console.log(`INFO: exit due to terminated energenie process. code=${code}, signal=${signal}`);
    // clear interval timer (causes program to exit as nothing left to do!)
    //clearInterval(doDiscovery);
	process.exit();
});

function UpdateMQTTDiscovery() {
	if (CONFIG.discovery_prefix){
		console.log(`> discovery`);
		forked.send({ cmd: "discovery", scan: false });
	}
}

// Each device has specific capabilities, which map to Home Assistant Components.
// This function publishes config items for these capabilities at @<discovery_prefix>/<component>/[<node_id>/]<object_id>/config
//
// Configuration of what values to publish is externalised to a file for each device product 'devices/<productId>.json'
//
function publishDiscovery( device, index ){

	if ( device.mfrId == 4){
		// energenie device

		// Read discovery config
		fs.readFile(`devices/${device.productId}.json`, (err, data) => {
			if (err) {
				console.log(`ERROR: discovery skipped for ${device.deviceId} - discovery file 'devices/${device.productId}.json' missing`);
			} else {
				device_defaults = JSON.parse(data);

				//console.log(`< discovery config for ${device_defaults.mdl}-${device.deviceId}`);
				device_defaults.parameters.forEach( (parameter) => {
					//console.log(`${device.deviceId}> ${parameter.component} ${parameter.id}`);
					//
					var object_id = `${device.deviceId}-${parameter.id}`;
					var unique_id = `ener314rt-${object_id}`;
					var name;
					if ((parameter.component == 'switch') ||
					    (parameter.component == 'binary_sensor' && (parameter.id == 'MOTION_DETECTOR' || parameter.id == 'DOOR_SENSOR') )) {
						// Shorten name for obvious parameters
						name = `${device_defaults.mdl} ${device.deviceId}`;
					} else if (parameter.id == 'retries') {
						// pretty command retries
						name = `${device_defaults.mdl} ${device.deviceId} command retries`;
					} else {
						name = `${device_defaults.mdl} ${device.deviceId} ${parameter.id.toLowerCase()}`
					}
					var discoveryTopic = `${CONFIG.discovery_prefix}${parameter.component}/ener314rt/${object_id}/config`;
					var dmsg = Object.assign({ uniq_id: `${unique_id}`, "~": `${CONFIG.topic_stub}`, name: `${name}`, mf: 'energenie', sw: 'mqtt-ener314rt' },
											parameter.config);

					// replace @ in topics with the address where each of the data items are published (state) or read (command)
					if (parameter.stat_t){
						dmsg.stat_t = parameter.stat_t.replace("@", `${device.productId}/${device.deviceId}/${parameter.id}`);
					}

					if (parameter.cmd_t){
						dmsg.cmd_t = parameter.cmd_t.replace("@", `${device.productId}/${device.deviceId}/${parameter.id}`);
					}

					console.log(`<C ${discoveryTopic}`);
					client.publish(discoveryTopic,JSON.stringify(dmsg),{retain: true});

				})

			}

		});

		// TODO error handling

	}
}

function lookupCommand( cmd ){
//	console.log(`lookupCommand ${cmd} ${Number(cmd)}`);
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
	};
	return cmd;
}

// Use single function to handle multiple signals
function handleSignal(signal) {
	console.log(`Received signal ${signal}, awaiting shutdown of energenie process...`);

	// terminate discovery loop, and therefore the process
	if (CONFIG.discovery_prefix) {
		CONFIG.discovery_prefix = null;
		clearInterval(doDiscovery);
	}

	// Gracefully shutdown energenie process
	//forked.send({ cmd: "close" });

	//disconnect from MQTT
	client.end();


  }
