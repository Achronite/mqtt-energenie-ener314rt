// mqtt-energenie-ener314rt app.js
//
// Copyright Achronite 2023
//

const APP_VERSION = 'v' + (require('./package.json')).version;

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
const CANCEL = 1;    // replace with 0 before sending
const EXERCISE_VALVE = 163;
const LOW_POWER_MODE = 164;
const VALVE_STATE = 165;
const DIAGNOSTICS = 166;
const THERMOSTAT_MODE = 170;  // Thermostat
const IDENTIFY = 191;
const REPORT_PERIOD = 210;
const TARGET_TEMP = 244;
const VOLTAGE = 226;
const SWITCH_STATE = 243;
const HYSTERESIS = 254;  // Thermostat
const RELAY_POLARITY = 171;  // Thermostat
const TEMP_OFFSET = 189;  // Thermostat
const HUMID_OFFSET = 186;  // Thermostat

// OpenThings Device constants
const MIHO004 = 1;
const MIHO005 = 2;
const MIHO006 = 5;
const MIHO013 = 3;
const MIHO032 = 12;
const MIHO033 = 13;
const MIHO069 = 18;
const MIHO089 = 19;

// retry state object
const rstate = {};

// import dependencies
const MQTT = require('mqtt');
var fs = require('fs');

// import my dependant node.js module
var ener314rt = require('energenie-ener314rt');

// import async processing for handling radio comms (pass in log level)
const { fork } = require('child_process');
const { hostname } = require('os');

var discovery = false;
var shutdown = false;

// setup signal error handling
process.on('SIGINT', handleSignal);
//process.on('SIGKILL', handleSignal );

// read xmit defaults from config file
let ook_xmits = 20;
let fsk_xmits = 20;
if (CONFIG.ook_xmits)
	ook_xmits = CONFIG.ook_xmits;
if (CONFIG.fsk_xmits)
	fsk_xmits = CONFIG.fsk_xmits;
// cached retries
let cached_retries = 10;
if (CONFIG.cached_retries)
	cached_retries = CONFIG.cached_retries;

// enable MIHO005 retry_switch by default
let retry_switch = true;
if (CONFIG.retry == false)
	retry_switch = false;

// connect to MQTT
log.info('MQTT', "connecting to broker %s", CONFIG.mqtt_broker);

// Add last will & testament message to set offline on disconnect
const availability_topic = `${CONFIG.topic_stub}availability/state`
var mqtt_options = CONFIG.mqtt_options;
mqtt_options.will = { topic: availability_topic, payload: 'offline', retain: true };

var client = MQTT.connect(CONFIG.mqtt_broker, mqtt_options);

// when MQTT is connected...
client.on('connect', function () {
	log.verbose('MQTT', "connected to broker %j", CONFIG.mqtt_broker);
	//log.verbose('MQTT', "config: %j", mqtt_options);			// Commented out for #66

	// Subscribe to incoming commands
	var options = {
		retain: true,
		qos: 0
	};

	var cmd_topic = MQTT_SUBTOPIC;
	client.subscribe(cmd_topic, options, function (err) {
		if (!err) {
			log.info('MQTT', "subscribed to %s", cmd_topic);
		} else {
			log.error('MQTT', "unable to subscribe to '%s'", cmd_topic);
		}
	});

	// set availability to online (offline is handled by LWT - see .connect )
	log.http('MQTT', "setting availability topic %s to 'online'", availability_topic);
	client.publish(availability_topic, 'online', { retain: true });

	// set initialisation time
	var d = new Date();
	var seconds = Math.round(d.getTime() / 1000);
	publishBoardState('initialised', seconds);
	publishBoardState('discover', 0);			// reset to 0 discovered devices

	publishLatestRelease();

	// Enable Periodic MQTT discovery at 1 min, and then every 10 minutes
	if (CONFIG.monitoring && CONFIG.discovery_prefix) {
		discovery = true;

		// Publish the parent 'board' discovery once on startup
		publishBoardDiscovery();

		// and then every day at 3:26am
		runAtSpecificTimeOfDay(3, 26, () => { publishBoardDiscovery() });

		log.info('discovery', "discovery enabled at topic prefix '%s'", CONFIG.discovery_prefix);
		// After 1 min update MQTT discovery topics
		setTimeout(UpdateMQTTDiscovery, (60 * 1000));

		// Every 10 minutes update MQTT discovery topics
		doDiscovery = setInterval(UpdateMQTTDiscovery, (600 * 1000));
	} else {
		log.warn('discovery', "discovery disabled");
	}



})

//
// eTRV Command Queue System
// Single dynamic queue with priority-based ordering and preemption.
// Priority order (descending): TARGET_TEMP > VALVE_STATE > REPORT_PERIOD > others
// Only one instance of each command type allowed in queue (latest replaces existing).
// Higher priority commands preempt currently processing command.
//
// eTRVs only wake and process cached commands every ~5 minutes; allow a generous timeout
// so we do not prematurely move on to the next command while retries are still pending.
const ETRV_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;  // 10 minute safety fallback if no completion message arrives.
const etrv_command_queues = {};  // deviceId -> { queue: cmd[], processing: boolean, current: cmd|null, completionTimer: NodeJS.Timeout|null }

function isCancelCommand(ener_cmd) {
	return !!ener_cmd && (ener_cmd.otCommand === 0 || ener_cmd.command === 'CANCEL');
}

function markETRVCommandComplete(deviceId, reason) {
	const queueState = etrv_command_queues[deviceId];
	if (!queueState || !queueState.processing) {
		return;
	}

	if (queueState.completionTimer) {
		clearTimeout(queueState.completionTimer);
		queueState.completionTimer = null;
	}

	const current = queueState.current;
	const commandName = current ? (current.command || current.otCommand || 'unknown') : 'unknown';
	log.verbose('queue', "eTRV %d: completed %s command (%s)", deviceId, commandName, reason || 'complete');

	queueState.processing = false;
	queueState.current = null;

	publishETRVQueueState(deviceId);
	processETRVQueue(deviceId);
}

function handleETRVRetriesUpdate(deviceId, retries, source) {
	if (isNaN(retries)) {
		return;
	}

	const queue = etrv_command_queues[deviceId];
	if (!queue) {
		return;
	}

	if (queue.processing && retries === 0) {
		markETRVCommandComplete(deviceId, source);
	}
}

function describeQueuedCommand(cmd) {
	if (!cmd) {
		return null;
	}

	if (isCancelCommand(cmd)) {
		return null;
	}

	const otCmd = cmd.otCommand;
	const baseCommand = cmd.command;
	const data = cmd.data;

	if (otCmd === TARGET_TEMP || baseCommand === 'TARGET_TEMP') {
		const temp = parseFloat(data);
		if (!Number.isNaN(temp)) {
			const rounded = Number.isInteger(temp) ? temp.toFixed(0) : temp.toFixed(1);
			return `Set Temperature ${rounded}°C`;
		}
		return 'Set Temperature';
	}

	if (otCmd === VALVE_STATE || baseCommand === 'VALVE_STATE') {
		const numeric = typeof data === 'number' ? data : parseInt(data, 10);
		switch (numeric) {
			case 0:
				return 'Valve Open';
			case 1:
				return 'Valve Closed';
			case 2:
				return 'Valve Heat';
			default:
				return 'Valve Mode';
		}
	}

	if (otCmd === LOW_POWER_MODE || baseCommand === 'LOW_POWER_MODE') {
		const isOn = data === 1 || data === '1' || data === true || data === 'ON';
		const isOff = data === 0 || data === '0' || data === false || data === 'OFF';
		if (isOn) {
			return 'Low Power Mode On';
		}
		if (isOff) {
			return 'Low Power Mode Off';
		}
		return 'Low Power Mode';
	}

	if (otCmd === EXERCISE_VALVE || baseCommand === 'EXERCISE_VALVE') {
		return 'Exercise Valve';
	}

	if (otCmd === DIAGNOSTICS || baseCommand === 'DIAGNOSTICS') {
		return 'Request Diagnostics';
	}

	if (otCmd === IDENTIFY || baseCommand === 'IDENTIFY') {
		return 'Identify';
	}

	if (otCmd === VOLTAGE || baseCommand === 'VOLTAGE') {
		return 'Request Voltage';
	}

	if (otCmd === REPORT_PERIOD || baseCommand === 'REPORT_PERIOD') {
		if (data !== undefined && data !== null) {
			return `Interval ${data}s`;
		}
		return 'Interval';
	}

	if (typeof otCmd === 'number' && otCmd > 0) {
		const desc = lookupCommand(otCmd, data);
		if (desc !== undefined && desc !== null) {
			return String(desc);
		}
	}

	if (baseCommand) {
		return String(baseCommand);
	}

	return 'Unknown';
}

function resolveQueueDisplay(value, hasCommand) {
	if (value === null || value === undefined) {
		return hasCommand ? 'Unknown' : 'None';
	}

	const str = String(value).trim();
	if (str.length === 0) {
		return hasCommand ? 'Unknown' : 'None';
	}

	return str;
}

function getCommandPriority(command, otCommand) {
	// Priority values (higher = more urgent)
	if (command === 'TARGET_TEMP' || otCommand === TARGET_TEMP) {
		return 400;  // Highest: temperature setting
	}
	if (command === 'VALVE_STATE' || otCommand === VALVE_STATE) {
		return 300;  // High: valve mode
	}
	if (command === 'REPORT_PERIOD' || otCommand === REPORT_PERIOD) {
		return 200;  // Medium: reporting interval
	}
	// All other commands (diagnostics, identify, low power mode, etc)
	return 100;  // Low: everything else
}

function getCommandType(ener_cmd) {
	// Return a unique identifier for command type (for deduplication)
	const otCmd = ener_cmd.otCommand;
	const baseCommand = ener_cmd.command;
	
	if (isCancelCommand(ener_cmd)) {
		return 'CANCEL';
	}
	if (otCmd === TARGET_TEMP || baseCommand === 'TARGET_TEMP') {
		return 'TARGET_TEMP';
	}
	if (otCmd === VALVE_STATE || baseCommand === 'VALVE_STATE') {
		return 'VALVE_STATE';
	}
	if (otCmd === REPORT_PERIOD || baseCommand === 'REPORT_PERIOD') {
		return 'REPORT_PERIOD';
	}
	if (otCmd === LOW_POWER_MODE || baseCommand === 'LOW_POWER_MODE') {
		return 'LOW_POWER_MODE';
	}
	if (otCmd === DIAGNOSTICS || baseCommand === 'DIAGNOSTICS') {
		return 'DIAGNOSTICS';
	}
	if (otCmd === VOLTAGE || baseCommand === 'VOLTAGE') {
		return 'VOLTAGE';
	}
	if (otCmd === EXERCISE_VALVE || baseCommand === 'EXERCISE_VALVE') {
		return 'EXERCISE_VALVE';
	}
	if (otCmd === IDENTIFY || baseCommand === 'IDENTIFY') {
		return 'IDENTIFY';
	}
	// Fallback to otCommand or command
	return String(otCmd || baseCommand || 'UNKNOWN');
}

function queueETRVCommand(deviceId, ener_cmd) {
	if (!etrv_command_queues[deviceId]) {
		etrv_command_queues[deviceId] = {
			queue: [],
			processing: false,
			current: null,
			completionTimer: null
		};
	}

	const queueState = etrv_command_queues[deviceId];
	const priority = getCommandPriority(ener_cmd.command, ener_cmd.otCommand);
	const cmdType = getCommandType(ener_cmd);

	if (isCancelCommand(ener_cmd)) {
		// Cancel: clear entire queue and stop current processing
		queueState.queue = [];
		
		// Stop current processing
		if (queueState.completionTimer) {
			clearTimeout(queueState.completionTimer);
			queueState.completionTimer = null;
		}
		queueState.processing = false;
		queueState.current = null;
		
		// Publish retries = 0 to signal cancellation
		const state_topic = `${CONFIG.topic_stub}${MIHO013}/${deviceId}/retries/state`;
		log.verbose('<', "%s: 0 (cancel)", state_topic);
		client.publish(state_topic, '0');
		
		// Add cancel command to queue
		queueState.queue.push(ener_cmd);
		log.info('queue', "eTRV %d: CANCEL - cleared all commands, set retries=0, queued cancel", deviceId);
	} else {
		// Check if new command should preempt or replace current
		let shouldPreempt = false;
		if (queueState.processing && queueState.current) {
			const currentType = getCommandType(queueState.current);
			const currentPriority = getCommandPriority(queueState.current.command, queueState.current.otCommand);
			
			// Preempt if: higher priority OR same type (replace with newer)
			if (priority > currentPriority || cmdType === currentType) {
				shouldPreempt = true;
				log.info('queue', "eTRV %d: preempting current %s command with %s", deviceId, queueState.current.command, ener_cmd.command);
				
				// Push current command back to queue (will be removed by deduplication if same type)
				queueState.queue.push(queueState.current);
				
				// Stop current processing
				if (queueState.completionTimer) {
					clearTimeout(queueState.completionTimer);
					queueState.completionTimer = null;
				}
				queueState.processing = false;
				queueState.current = null;
			}
		}
		
		// Remove any existing command of same type (keep only latest)
		queueState.queue = queueState.queue.filter(cmd => getCommandType(cmd) !== cmdType);
		
		// Add new command to queue
		queueState.queue.push(ener_cmd);
		
		// Sort queue by priority (descending)
		queueState.queue.sort((a, b) => {
			const priorityA = getCommandPriority(a.command, a.otCommand);
			const priorityB = getCommandPriority(b.command, b.otCommand);
			return priorityB - priorityA;  // Higher priority first
		});

		log.verbose('queue', "eTRV %d: queued %s (priority: %d, queue length: %d)", deviceId, ener_cmd.command, priority, queueState.queue.length);
	}

	// Publish updated queue state
	publishETRVQueueState(deviceId);

	// Try to process queue
	processETRVQueue(deviceId);
}

function processETRVQueue(deviceId) {
	const queueState = etrv_command_queues[deviceId];
	if (!queueState || queueState.processing) {
		return; // Already processing or no queue
	}

	// Get highest priority command from queue
	if (queueState.queue.length === 0) {
		return; // No commands to process
	}

	const commandToSend = queueState.queue.shift(); // Take from front (already sorted by priority)
	
	if (queueState.completionTimer) {
		clearTimeout(queueState.completionTimer);
		queueState.completionTimer = null;
	}

	queueState.processing = true;
	queueState.current = {
		...commandToSend,
		priority: getCommandPriority(commandToSend.command, commandToSend.otCommand)
	};

	log.verbose('queue', "eTRV %d: processing %s command (priority: %d, remaining: %d)", 
		deviceId, commandToSend.command, queueState.current.priority, queueState.queue.length);

	// Publish queue state before sending command
	publishETRVQueueState(deviceId);

	// Send command to energenie process
	forked.send(commandToSend);

	// Set fallback timeout (10 minutes for eTRV wake cycle)
	queueState.completionTimer = setTimeout(() => {
		log.warn('queue', "eTRV %d: command timeout after 10 minutes, marking as complete", deviceId);
		markETRVCommandComplete(deviceId, 'timeout');
	}, ETRV_COMMAND_TIMEOUT_MS);
}

// Update diagnostic queue with deduplication and replacement rules
// - LOW_POWER_MODE: new replaces any existing LOW_POWER_MODE in queue
// - REPORT_PERIOD: keep only latest REPORT_PERIOD
// - Other diagnostics: enqueue only if not already present
// No longer needed - deduplication now handled in queueETRVCommand

// Publish per-device eTRV queue state to MQTT for Home Assistant sensors
function publishETRVQueueState(deviceId) {
	const queueState = etrv_command_queues[deviceId];
	if (!queueState) return;

	// Helper to publish a single key
	function pub(key, value, retain = false) {
		const state_topic = `${CONFIG.topic_stub}${MIHO013}/${deviceId}/${key}/state`;
		const state = String(value === undefined || value === null ? '' : value);
		if (retain) {
			log.verbose('<', "%s: %s (retained)", state_topic, state);
			client.publish(state_topic, state, { retain: true });
		} else {
			log.verbose('<', "%s: %s", state_topic, state);
			client.publish(state_topic, state);
		}
	}

	// Get all commands (current + queued), excluding CANCEL
	// Note: Don't double-count current if it's also in queue
	const allCommands = [];
	const currentType = queueState.current ? getCommandType(queueState.current) : null;
	
	if (queueState.current && currentType !== 'CANCEL') {
		allCommands.push(queueState.current);
	}
	
	queueState.queue.forEach(cmd => {
		const cmdType = getCommandType(cmd);
		// Skip if CANCEL or if it's the same command currently processing
		if (cmdType !== 'CANCEL' && !(queueState.current && cmdType === currentType && cmd.data === queueState.current.data)) {
			allCommands.push(cmd);
		}
	});

	// processing flag
	pub('QUEUE_PROCESSING', queueState.processing ? 'true' : 'false');

	// Primary queue command (first in list)
	const primaryCommand = allCommands.length > 0 ? allCommands[0] : null;
	const primaryDisplayRaw = primaryCommand ? describeQueuedCommand(primaryCommand) : null;
	const primaryDisplay = resolveQueueDisplay(primaryDisplayRaw, Boolean(primaryCommand));
	pub('QUEUE_COMMAND', primaryDisplay);

	// Total queue length
	pub('QUEUE_LEN', allCommands.length);

	// Publish full queue as JSON attributes for both QUEUE_COMMAND and QUEUE_LEN
	const allDisplays = allCommands
		.map(cmd => describeQueuedCommand(cmd))
		.filter(val => val !== null && val !== undefined && String(val).trim().length > 0)
		.map(item => resolveQueueDisplay(item, true));
	
	const queueAttr = {
		current: queueState.current ? resolveQueueDisplay(describeQueuedCommand(queueState.current), true) : 'None',
		pending: queueState.queue
			.filter(cmd => getCommandType(cmd) !== 'CANCEL')
			.map(cmd => resolveQueueDisplay(describeQueuedCommand(cmd), true)),
		all: allDisplays
	};
	
	// Publish to QUEUE_COMMAND attributes
	const queueCmdAttrTopic = `${CONFIG.topic_stub}${MIHO013}/${deviceId}/QUEUE_COMMAND/attributes`;
	log.verbose('<', "%s: %j", queueCmdAttrTopic, queueAttr);
	client.publish(queueCmdAttrTopic, JSON.stringify(queueAttr));
	
	// Publish to QUEUE_LEN attributes
	const queueLenAttrTopic = `${CONFIG.topic_stub}${MIHO013}/${deviceId}/QUEUE_LEN/attributes`;
	log.verbose('<', "%s: %j", queueLenAttrTopic, queueAttr);
	client.publish(queueLenAttrTopic, JSON.stringify(queueAttr));
}

//
// eTRV Battery Voltage Polling
// Request battery voltage from all known eTRVs periodically
//
const known_etrvs = new Set();  // Track discovered eTRV deviceIds

function addKnownETRV(deviceId) {
	if (!known_etrvs.has(deviceId)) {
		known_etrvs.add(deviceId);
		log.verbose('battery', "Added eTRV %d to battery polling list", deviceId);
	}
}

function requestETRVBatteryVoltages() {
	if (known_etrvs.size > 0) {
		log.verbose('battery', "Requesting voltage from %d eTRVs", known_etrvs.size);
		known_etrvs.forEach(deviceId => {
			const voltage_cmd = {
				cmd: 'cacheCmd',
				mode: 'fsk',
				repeat: fsk_xmits,
				command: 'VOLTAGE',
				productId: 3,  // MIHO013
				deviceId: deviceId,
				otCommand: VOLTAGE,
				data: 0,
				retries: cached_retries
			};
			queueETRVCommand(deviceId, voltage_cmd);
		});
	}
}

// Poll battery voltage every 24 hours (86400000 ms)
const batteryPollInterval = setInterval(requestETRVBatteryVoltages, 86400000);

//handle incoming MQTT messages
client.on('message', function (topic, msg, packet) {
	// format command for passing to energenie process
	// format is OOK: 'energenie/c/ook/zone/switchNum/command' or OT: 'energenie/c/2/deviceNum/command'
	log.verbose('>', "%s: %s", topic, msg);
	const cmd_array = topic.split("/");

	let otCommand = 0;

	switch (cmd_array[MQTTM_DEVICE]) {
		case 'ook':
		case 'OOK':
		case 'o':
			// All ook 1-way devices

			// Is this request for a dimmer switch?
			if (cmd_array[MQTTM_OOK_SWITCH] == "dimmer") {
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
		case MIHO005:
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

			//
			// Store target switch state to ensure it switches if retry function enabled
			//
			if (retry_switch) {
				// use eval to set a specific variable to store the requested state (rstate) based upon the deviceId
				// this will be checked on the next periodic report from the device to ensure it has processed the switch command
				let dynamicName = `_${ener_cmd.deviceId}`;
				rstate[dynamicName] = switchState;
				log.verbose("cmd", "openThingsSwitch() retry enabled %s=%s", dynamicName, rstate[dynamicName]);
			}

			break;
		case '3':
		case 3:
			// MIHO013 - Smart Radiator Valve
			//
			// TODO: Check data values (msg) passed in is valid for the command

			/* Valid Commands:
				163 EXERCISE_VALVE 	   	(DIAGNOSTICS)
				164 SET_LOW_POWER_MODE	(DIAGNOSTICS)
				165 SET_VALVE_STATE 	Set valve state 0=Open, 1=Closed, 2=Auto
				166 DIAGNOSTICS 		(DIAGNOSTICS)
				191 IDENTIFY
				210 REPORT_PERIOD	300-3600 seconds
				226 REQUEST_VOLTAGE 	Report current voltage of the batteries (VOLTAGE)
				TEMP_SET
			*/

			var stateTopic = null;
			var msg_data = Number(msg);

			// Convert OpenThings Cmd String to Numeric
			switch (cmd_array[MQTTM_OT_CMD]) {
				case 'MAINTENANCE':
					// Special select processing from Home Assistant built for the eTRV
					// The idea here is to translate the MAINTENANCE commands into OpenThings Commands
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
							break;
						default:
							log.warn('cmd', "Unsupported MAINTENANCE command: %s type:%j for eTRV", msg, typeof (msg));
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
				case 'REPORT_PERIOD':
					otCommand = REPORT_PERIOD;
					break;
				default:
					// unsupported command
					log.warn('cmd', "Unsupported cacheCmd for eTRV: %j %j", cmd_array[MQTTM_OT_CMD], msg);
					return;
			} // switch 3: MQTTM_OT_CMD;

			if (otCommand > 0) {
				// We have a valid eTRV command

				// swap out CANCEL for 0
				if (otCommand == CANCEL) {
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
					data: msg_data,
					retries: cached_retries
				};
			} else {
				log.warn('cmd', "Invalid otCommand for eTRV: %j", otCommand);
			}
			break;

		case '18':
		case 18:
			// MIHO069 - Smart Thermostat (alpha)
			var msg_data = Number(msg);
			log.verbose('cmd', "Thermostat msg_data : %s", msg);

			// Process (cached) command
			switch (cmd_array[MQTTM_OT_CMD]) {
				case 'TARGET_TEMP':
					otCommand = TARGET_TEMP;
					break;
				case 'THERMOSTAT_MODE':
					otCommand = THERMOSTAT_MODE;
					break;
				case 'HYSTERESIS':				// aka TEMP_MARGIN
					otCommand = HYSTERESIS;
					break;
				case 'RELAY_POLARITY':
					otCommand = RELAY_POLARITY;
					// Convert booleans from HA default (ON/OFF)
					if (msg == "ON" || msg == "on") {
						msg_data = 1;
					} else if (msg == "OFF" || msg == "off") {
						msg_data = 0;
					}
					break;
				case 'TEMP_OFFSET':
					otCommand = TEMP_OFFSET;
					break;
				case 'HUMID_OFFSET':
					otCommand = HUMID_OFFSET;
					break;
				case 'REPORT_PERIOD':		// DO NOT USE
					otCommand = REPORT_PERIOD;
					break;
				case 'CANCEL':
				case 1:
					otCommand = CANCEL;
				default:
					// unsupported command (but allow it through)
					otCommand = Number(cmd_array[MQTTM_OT_CMD]);
					log.warn('cmd', "Unsupported Cmd for Thermostat: %j (%d) %j", cmd_array[MQTTM_OT_CMD], otCommand, msg);

			} // switch 18: MQTTM_OT_CMD;

			if (otCommand > 0) {
				// We have a valid Thermostat command

				// swap out CANCEL for 0
				if (otCommand == CANCEL) {
					otCommand = 0;
				}

				// Thermostat commands are cached
				var ener_cmd = {
					cmd: 'cacheCmd', mode: 'fsk', repeat: fsk_xmits,
					command: cmd_array[MQTTM_OT_CMD],
					productId: Number(cmd_array[MQTTM_OT_PRODUCTID]),
					deviceId: Number(cmd_array[MQTTM_OT_DEVICEID]),
					otCommand: otCommand,
					data: msg_data,
					retries: cached_retries
				};
			} else {
				log.warn('cmd', "Invalid otCommand for Thermostat : %j", otCommand);
			}
			break;
		case 'board':
			// NOTE: there is no productId for the board
			switch (cmd_array[MQTTM_OT_CMD]) {
				case 'discover':
				case 'scan':
					// Call discovery function - force a scan as button was pressed
					ener_cmd = { cmd: "discovery", scan: true };
					break;
			}
			break;

		default:
		// Undefined device
	} // switch MQTTM_DEVICE

	if (ener_cmd !== undefined) {
		// Send request to energenie process, any responses are handled by forked.on('message')
		log.http("command", "%j", ener_cmd);

		// Use command queue for eTRV to prevent conflicts
		if (ener_cmd.productId === 3 && ener_cmd.cmd === 'cacheCmd') {
			queueETRVCommand(ener_cmd.deviceId, ener_cmd);
		} else {
			forked.send(ener_cmd);
		}
	} else {
		log.warn('cmd', "Invalid MQTT device/command %j:%j", cmd_array[MQTTM_DEVICE], msg);
	}
});

//handle MQTT errors
client.on('error', function (error) {
	if (!shutdown)
		log.error('MQTT', "ERROR %j connecting to MQTT broker: %j", error, CONFIG.mqtt_broker);
	process.exit(1)
});

//Report MQTT close
client.on('close', function () {
	log.warn('MQTT', "Disconnected from MQTT broker: %s", CONFIG.mqtt_broker);
	//process.exit(1)
});

// fork energenie process to handle all energenie Rx/Tx
const forked = fork("energenie.js", [log.level]);


forked.on("spawn", msg => {
	// process started succesfully, request start of the monitor loop if configured in config file
	if (CONFIG.monitoring) {
		log.info("monitor", "starting monitoring of FSK devices...");
		forked.send({ cmd: "monitor", enabled: true });
	}
});
/*
** Handle monitor/results messages returned by energenie
*/
forked.on("message", msg => {
	// we have a monitor or ACK message, transform into MQTT message
	log.http("monitor", "received: %j", msg);

	switch (msg.cmd) {
		case 'send':
			var rtn_msg = "UNKNOWN";
			var state_topic;
			switch (msg.mode) {
				case 'ook':
					if (msg.brightness) {
						// dimmer switch uses brightness instead of state: 1-10 (ON at Brightness) or OFF
						log.verbose('app', "dimmer: %j", msg);

						// use the value of dimmer instead of switchNum
						state_topic = `${CONFIG.topic_stub}ook/${msg.zone}/dimmer/state`;
						rtn_msg = String(msg.brightness);

					} else {
						state_topic = `${CONFIG.topic_stub}ook/${msg.zone}/${msg.switchNum}/state`;

						if (typeof (msg.state) === 'boolean') {
							if (msg.state) {
								rtn_msg = "ON";
							} else {
								rtn_msg = "OFF";
							}
						} else {
							log.error('app', "msg.state not boolean, type = %j", typeof (msg.state));
						}
					}
					// send response back via MQTT state topic, setting the retained flag to survive restart on client
					log.verbose('<', "%s: %s (retained)", state_topic, rtn_msg);
					client.publish(state_topic, rtn_msg, { retain: true });
					break;

				case 'fsk':
					// TODO allow for multiple parameters being returned
					state_topic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/${msg.command}/state`;

					if (typeof (msg.state) === 'boolean') {
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
					client.publish(state_topic, rtn_msg);

					break;

			} // switch 'send' msg.mode


			break;

		case 'monitor':
			// OpenThings monitor message

			let keys = Object.keys(msg);

			// Variable to cache temperature for HVAC action calculation
			let cachedTemperature = null;

			// Iterate through the object returned
			keys.forEach((key) => {
				let topic_key = key;
				let retain = false;;
				switch (key) {
					case 'productId':
					case 'deviceId':
					case 'mfrId':
					case 'cmd':
					case 'WAKEUP':
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
							switchState = true;
						} else {
							msg[key] = "OFF";
							switchState = false;
						}

						break;
					case 'MOTION_DETECTOR':
						// TO DO - This passes back the weird values sent back by the thermostat; these need interpreting properly
						if (msg[key] == 1 || msg[key] == '1') {
							msg[key] = "ON";
							topic_key = 'motion';
						} else if (msg[key] == 0 || msg[key] == '0') {
							msg[key] = "OFF";
							topic_key = 'motion';
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
					case 'RELAY_POLARITY':
						// binary retained fields
						if (msg[key] == 1 || msg[key] == '1') {
							msg[key] = "ON";
						} else {
							msg[key] = "OFF";
						}
						retain = true;
						break;
					case 'ERRORS':
						// other binary fields
						if (msg[key] == 1 || msg[key] == '1') {
							msg[key] = "ON";
						} else {
							msg[key] = "OFF";
						}
						break;
					case 'command':
						// As we use MQTT, and the command state has already been set when cacheCmd was called, there isn't a need here to update it unless the command has succeeded
						// and anyways it would be difficult to extract the data value for this to be shown here
						if (msg[key] == 0 || msg[key] == '0')
							msg[key] = "None";
						else
							topic_key = null;
						break;
					case 'TEMPERATURE':
						// Cache temperature for later HVAC action calculation (eTRV only)
						if (msg.productId == 3) {
							cachedTemperature = parseFloat(msg.TEMPERATURE);
							if (isNaN(cachedTemperature)) {
								log.warn('eTRV', 'Invalid TEMPERATURE value received: %s', msg.TEMPERATURE);
								cachedTemperature = null;
							} else {
								log.verbose('eTRV', 'Cached TEMPERATURE: %s for deviceId: %s', cachedTemperature, msg.deviceId);
							}
						}
						break;

					case 'TARGET_TEMP':
						// Calculate HVAC action when TARGET_TEMP is received (eTRV only)
						if (msg.productId == 3 && cachedTemperature !== null) {
							const targetTemp = parseFloat(msg[key]);

							if (!isNaN(targetTemp)) {
								// Determine HVAC action: heating if current temp is below target, otherwise idle
								const hvacAction = cachedTemperature < targetTemp ? 'heating' : 'idle';
								const deltaTemp = (cachedTemperature - targetTemp).toFixed(2);

								log.info('eTRV', 'HVAC calculation - Current: %s°C, Target: %s°C, Delta: %s°C, Action: %s',
									cachedTemperature, targetTemp, deltaTemp, hvacAction);

								// Publish HVAC action and temperature delta
								const hvacTopic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/HVAC_ACTION/state`;
								const deltaTempTopic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/DELTA_TEMP/state`;

								client.publish(hvacTopic, hvacAction, { qos: 0, retain: false });
								client.publish(deltaTempTopic, deltaTemp, { qos: 0, retain: false });
							} else {
								log.warn('eTRV', 'Invalid TARGET_TEMP value: %s', msg[key]);
							}
						}
						// Set retain flag for TARGET_TEMP
						retain = true;
						break;

					case 'VALVE_STATE':
					case 'REPORT_PERIOD':
					case 'ERROR_TEXT':
					case 'THERMOSTAT_MODE':
					case 'HYSTERESIS':
					case 'TEMP_OFFSET':
					case 'HUMID_OFFSET':
						// These values need to be retained on MQTT as they are irregularly reported
						retain = true;
						break;
					case 'VOLTAGE':
					case 'BATTERY_LEVEL':
						let batteries = 0;
						// Voltage values are device specific
						switch (msg.productId) {
							case 3:		// eTRV
								batteries = 2;
								retain = true;
								break;
							case 5:		// Energy Monitor
								batteries = 3;
								break;
							case 18:	// Thermostat
								batteries = 2;
								break;
							case 19:    // Click - 3V single battery ~ 2 AA batteries
								batteries = 2;
						}
						if (batteries > 0) {
							// calculate battery % where applicable assuming alkaline batteries, calculations from internet ;)
							let v = msg[key] / batteries;
							let charge = 0;
							if (v >= 1.55) {
								charge = 100;
							} else if (v < 1.1) {
								charge = 0
							} else if (v < 1.18) {
								charge = 5;
							} else {
								// use a simple linear equation for the rest (y=mx+c), based on 1.44v=90% and 1.2v=10%
								charge = (333.3 * v) - 390;

								// Can produce high values at top end, restrict down
								if (charge > 95) {
									charge = 95;
								}
								//charge = 9412 - 23449*(v/batteries) + 19240*(v*v/batteries) - 5176*(v*v*v/batteries); // cubic regression
							}

							// send addition battery percentage response back via MQTT state topic
							state_topic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/battery/state`;
							state = String(Math.round(charge));
							if (retain) {
								log.verbose('<', "%s: %s (retained)", state_topic, state);
								client.publish(state_topic, state, { retain: true });
							} else {
								log.verbose('<', "%s: %s", state_topic, state);
								client.publish(state_topic, state);
							}
						}

					case 'ALARM':
						// Translate suspected low battery alert to text
						if (msg[key] == 66 | msg[key] == '66') {
							// send low battery alert - NOT retained as this never clears
							msg[key] = "Low Battery";
						}

					default:
						// captured OpenThings commands (e.g from MiHome gateway) are preceeded with '_', set retained on these so we can find them more easily in MQTT Explorer
						if (key.startsWith("_")) {
							retain = true;
						}
					// assume an unknown key we need to set in topic tree
				}

				// send MQTT response (state) if we have a valid topic string
				if (topic_key !== null && msg.productId !== undefined && msg.deviceId !== undefined) {
					state_topic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/${topic_key}/state`;
					state = String(msg[key]);

					// send response back via MQTT state topic
					if (retain) {
						log.verbose('<', "%s: %s (retained)", state_topic, state);
						client.publish(state_topic, state, { retain: true });
					} else {
						log.verbose('<', "%s: %s", state_topic, state);
						client.publish(state_topic, state);
					}

					if (msg.productId == MIHO013 && topic_key == "retries") {
						handleETRVRetriesUpdate(msg.deviceId, Number(state), 'monitor');
					}

					// Update MAINTENANCE if retries=0 for trv
					if (msg.productId == MIHO013 && topic_key == "retries" && state == '0') {
						// retries are now empty, also change the MAINTENANCE Select back to None
						state_topic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/MAINTENANCE/state`;
						log.verbose('<', "%s: None", state_topic);
						client.publish(state_topic, "None");
					}

					// Check returned state for MIHO005 to see if switched correctly
					if (retry_switch && msg.productId == MIHO005 && topic_key == 'switch') {
						let dynamicName = `_${msg.deviceId}`;
						if (dynamicName in rstate) {
							log.verbose('monitor', 'checking switch command for %s', msg.deviceId);
							// we have previously sent a command, did the device switch?
							if (switchState == rstate[dynamicName]) {
								// switch was ok, remove the dynamic key to prevent re-checking
								delete rstate[dynamicName];
							} else {
								// retry switch command
								var ener_cmd = {
									cmd: 'send', mode: 'fsk', repeat: fsk_xmits, command: 'switch',
									productId: msg.productId,
									deviceId: msg.deviceId,
									switchState: rstate[dynamicName]
								};
								log.http("command", "RETRY %j", ener_cmd);
								forked.send(ener_cmd);
							}
						}
					}
				};
			})

			break;
		case 'discovery':
			// device discovery message publish discovery messages to Home Assistant
			log.info('discovery', "found %i devices", msg.numDevices);
			publishBoardState('discover', msg.numDevices);
			msg.devices.forEach(device => {
				publishDiscovery(device);
				// Track eTRVs for battery voltage polling
				if (device.productId === 3) {
					addKnownETRV(device.deviceId);
				}
			});
			break;

		case 'cacheCmd':
			// response from a cacheCmd, store the command (as text) and retries

			log.http('cached', "%j", msg);

			// send MQTT if we have a valid topic string
			if (msg.productId !== undefined && msg.deviceId !== undefined) {

				if (typeof (msg.retries) != "undefined") {
					state_topic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/retries/state`;
					state = String(msg.retries);
					// set retries on MQTT
					log.verbose('<', "%s: %s", state_topic, state);
					client.publish(state_topic, state);

					if (msg.productId === MIHO013) {
						handleETRVRetriesUpdate(msg.deviceId, Number(state), 'cache');
					}
				}

				if (typeof (msg.otCommand) != "undefined") {
					state_topic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/command/state`;
					state = String(lookupCommand(msg.otCommand, msg.data));

					// save cached command on MQTT
					log.verbose('<', "%s: %s", state_topic, state);
					client.publish(state_topic, state);
				}

				// Store cached state for values that are NEVER returned by monitor messages (confirmed by energenie)
				if (msg.productId == MIHO013 && msg.command == 'VALVE_STATE') {
					state_topic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/${msg.command}/state`;
					state = String(msg.data);

					// send response back via MQTT
					log.verbose('<', "%s: %s (optimistic retained)", state_topic, state);
					client.publish(state_topic, state, { retain: true });
				}

			};
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
	if (discovery) {
		log.info('auto', "calling discovery");
		forked.send({ cmd: "discovery", scan: false });
	}
}

// Each device has specific capabilities, which map to Home Assistant Components.
// This function publishes config items for these capabilities at @<discovery_prefix>/<component>/[<node_id>/]<object_id>/config
//
// Configuration of what values to publish is externalised to a file for each device product 'devices/<productId>.json'
//
function publishDiscovery(device) {

	log.info('discovery', "discovered: %j", device);

	if (device.mfrId == 4) {
		// energenie device

		// Read discovery config
		fs.readFile(`devices/${device.productId}.json`, (err, data) => {
			if (err) {
				log.error('discovery', "skipped for device %i - unknown device type 'devices/%j.json' missing", device.deviceId, device.productId);
			} else {
				device_defaults = JSON.parse(data);
				device_defaults.parameters.forEach((parameter) => {
					//
					// To save on network/processing only the main entity will contain the details of the device that they belong to
					//
					if (parameter.main) {
						var device_details = {
							name: `${device_defaults.mdl} ${device.deviceId}`,
							ids: [`ener314rt-${device.deviceId}`],
							mdl: `${device_defaults.mdl} (${device_defaults.mdlpn}) [${device.deviceId}]`,
							mf: 'Energenie',
							sw: `mqtt-ener314rt ${APP_VERSION}`,
							via_device: 'mqtt-energenie-ener314rt'
						}
						// To align to HA standards, the main parameter should not be appended to the entity name
						// Except when the main component is type sensor, where we must preserve it
						if (parameter.component == "sensor") {
							var entity_name = toTitleCase(parameter.id);
						} else {
							var entity_name = null;
						}

					} else {
						var entity_name = toTitleCase(parameter.id);
						var device_details = { ids: [`ener314rt-${device.deviceId}`] };
					}

					var dmsg = Object.assign({
						uniq_id: `ener314rt-${device.deviceId}-${parameter.id}`,
						device: device_details,
						"~": `${CONFIG.topic_stub}${device.productId}/${device.deviceId}/`,
						name: entity_name,
						avty_t: `${CONFIG.topic_stub}availability/state`,
						o: {
							name: `mqtt-energenie-ener314rt`,
							sw: `${APP_VERSION}`,
							url: `https://github.com/Achronite/mqtt-energenie-ener314rt`
						}
					},
						parameter.config);

					// replace @ in topics with the address where each of the data items are published (state) or read (command)
					if (parameter.stat_t) {
						dmsg.stat_t = parameter.stat_t.replace("@", `${parameter.id}`);
					}

					if (parameter.cmd_t) {
						dmsg.cmd_t = parameter.cmd_t.replace("@", `${parameter.id}`);
					}

					// Include JSON attributes topic mapping for sensors
					if (parameter.json_attr_t) {
						dmsg.json_attr_t = parameter.json_attr_t.replace("@", `${parameter.id}`);
					}

					var discoveryTopic = `${CONFIG.discovery_prefix}${parameter.component}/ener314rt/${device.deviceId}-${parameter.id}/config`;

					log.verbose('<', "discovery %s", discoveryTopic);
					client.publish(discoveryTopic, JSON.stringify(dmsg), { retain: true });

				})

			}

		});

		// TODO error handling

	}
}

/*
** Internal Function that return the english parameter name (for display) of a given OpenThings parameter code (cmd)
** If the parameter requires a data value (data) to be set this is appended to the name of the command giving the full string
*/
function lookupCommand(cmd, data) {
	let command = null;
	switch (Number(cmd)) {
		case 0:
			return 'None';
		case THERMOSTAT_MODE:
			command = 'Thermostat Mode';
			break;
		case TARGET_TEMP:
			command = 'Set Temperature';
			break;
		case EXERCISE_VALVE:
			return 'Exercise Valve';
		case LOW_POWER_MODE:
			command = 'Low Power Mode';
			break;
		case VALVE_STATE:
			command = 'Valve Mode';
			break;
		case DIAGNOSTICS:
			return 'Diagnostics';
		case REPORT_PERIOD:
			command = 'Interval';
			break;
		case IDENTIFY:
			return 'Identify';
		case VOLTAGE:
			return 'Request Voltage';
		case TEMP_OFFSET:
			command = 'Temp Offset';
			break;
		case HUMID_OFFSET:
			command = 'Humidity Offset';
			break;
		case RELAY_POLARITY:
			command = 'Relay Polarity';
			break;
		case HYSTERESIS:
			command = 'Temp Margin';
			break;
		case SWITCH_STATE:
			command = 'Switch';
			break;
		default:
			return cmd;
	};
	if (data != "undefined" && data != null)
		return command.concat(" ", data);
	else
		return command;
}

// Use single function to handle multiple signals
function handleSignal(signal) {
	shutdown = true;
	log.warn('app', "received %j signal", signal);

	// publish offline to MQTT (abnormal disconnects also set this via MQTT LWT)
	log.info('MQTT', "setting %s to 'offline'", availability_topic);
	client.publish(availability_topic, 'offline', { retain: true });
	publishBoardState('initialised', undefined);
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

// This function publishes the config items for parent board @<discovery_prefix>/board/1/<object_id>/config
// This is only called once on initialisation
// Configuration of the values to publish is externalised to a file 'devices/board.json'
//
function publishBoardDiscovery() {

	const deviceId = 'board';

	log.info('discovery', "board discovered");

	// Read discovery config
	fs.readFile(`devices/board.json`, (err, data) => {
		if (err) {
			log.error('discovery', "devices/board.json missing");
		} else {
			device_defaults = JSON.parse(data);
			device_defaults.parameters.forEach((parameter) => {
				//
				var object_id = `${deviceId}-${parameter.id}`;
				var unique_id = `ener314rt-${object_id}`;				///
				var entity_name = toTitleCase(parameter.id);
				var device_name = `${device_defaults.mdl}`;
				var discoveryTopic = `${CONFIG.discovery_prefix}${parameter.component}/ener314rt/${object_id}/config`;
				//          var dmsg = Object.assign({ uniq_id: `${unique_id}`, "~": `${CONFIG.topic_stub}`, name: `${name}`, mf: 'energenie', sw: 'mqtt-ener314rt' },
				var dmsg = Object.assign({
					device: {
						name: `${device_name}`,
						ids: [`mqtt-energenie-ener314rt`],
						mdl: `${device_defaults.mdlpn}`,
						mf: 'Energenie',
						sw: `${device_defaults.mdl} ${APP_VERSION}`,
						hw: `${hostname}`
					},
					uniq_id: `${unique_id}`,
					"~": `${CONFIG.topic_stub}${deviceId}/1/`,
					name: `${entity_name}`,
					o: {
						name: `mqtt-energenie-ener314rt`,
						sw: `${APP_VERSION}`,
						url: `https://github.com/Achronite/mqtt-energenie-ener314rt`
					}
				},
					parameter.config,);

				// Add MQTT availability only to the 'Discover' button
				if (parameter.id == 'discover') {
					dmsg.avty_t = `${CONFIG.topic_stub}availability/state`;
				}

				// replace @ in topics with the address where each of the data items are published (state) or read (command)
				if (parameter.stat_t) {
					dmsg.stat_t = parameter.stat_t.replace("@", `${parameter.id}`);
				}

				if (parameter.cmd_t) {
					dmsg.cmd_t = parameter.cmd_t.replace("@", `${parameter.id}`);
				}

				log.verbose('<', "discovery %s", discoveryTopic);
				client.publish(discoveryTopic, JSON.stringify(dmsg), { retain: true });

			})

		}

	});

}

// Update stats to MQTT for the overall program
function publishBoardState(param, state) {
	state_topic = `${CONFIG.topic_stub}board/1/${param}/state`;

	// send response back via MQTT
	log.verbose('<', "%s: %s (board)", state_topic, state);
	client.publish(state_topic, String(state));
}

// Get latest release data from github (uses native node.js functionality) and publish to update object for board
function publishLatestRelease() {
	fetch('https://api.github.com/repos/Achronite/mqtt-energenie-ener314rt/releases/latest')
		.then((response) => response.json())
		.then((data) => {
			const github_details = {
				"installed_version": APP_VERSION,
				"latest_version": data.tag_name,
				"title": "mqtt-energenie-ener314rt",
				"release_summary": data.body,
				"release_url": data.html_url,
			}

			// Publish it to MQTT version
			state_topic = `${CONFIG.topic_stub}board/1/version/state`;
			log.verbose('<', "%s: %j (board)", state_topic, github_details.latest_version);
			client.publish(state_topic, JSON.stringify(github_details), { retain: true });
		})
		.catch(error => log.warn('version', 'error getting latest release data from github:', error)
		);

}

// run a function at the same time every day (credit @farhad-taran)
function runAtSpecificTimeOfDay(hour, minutes, func) {
	const twentyFourHours = 86400000;
	const now = new Date();
	let eta_ms = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minutes, 0, 0).getTime() - now;
	if (eta_ms < 0) {
		eta_ms += twentyFourHours;
	}
	setTimeout(function () {
		//run once
		func();
		// run every 24 hours from now on
		setInterval(func, twentyFourHours);
	}, eta_ms);
}